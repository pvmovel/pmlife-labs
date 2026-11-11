<?php
declare(strict_types=1);

namespace Spike\Chat;

/**
 * O chat de quem está na sessão. Toda resposta é [status, corpo]. O remetente, a instituição e a turma vêm só da sessão;
 * o pedido traz o canal, o texto e, no privado, o colega.
 *
 *   poll     {since, place, x, z}         a posição de agora (no produto, a batida da presença) e as mensagens novas
 *   send     {channel, body, to?}         mandar (turma, perto ou privado)
 *   block    {id, on}                     bloquear ou desbloquear um colega
 *   report   {messageId}                  denunciar uma mensagem que chegou à pessoa
 *   settings {chatOn, privateOn, words}   só o master: o chat do curso
 *   reports  {}                           só o master: as denúncias abertas
 *   resolve  {id}                         só o master: resolver uma denúncia
 */
final class ChatService
{
    private const PLACE = '/^[A-Za-z0-9_-]{0,40}$/';

    public function __construct(private readonly ChatStore $store)
    {
    }

    /**
     * @param array<string, mixed> $in
     * @return array{0: int, 1: array<string, mixed>}
     */
    public function handle(?Member $who, array $in): array
    {
        if ($who === null) {
            return self::error(401, 'UNAUTHENTICATED');
        }
        return match ($in['action'] ?? null) {
            'poll' => $this->poll($who, $in),
            'send' => $this->send($who, $in),
            'block' => $this->block($who, $in),
            'report' => $this->report($who, $in),
            'settings' => $this->settings($who, $in),
            'reports' => $who->isMaster() ? self::ok(['reports' => $this->reports($who)]) : self::error(403, 'FORBIDDEN'),
            'resolve' => !$who->isMaster() ? self::error(403, 'FORBIDDEN') : ($this->store->resolve($who->tenantId, $in['id'] ?? null) ? self::ok(['resolved' => true]) : self::error(404, 'REPORT_NOT_FOUND')),
            default => self::error(400, 'INVALID_REQUEST'),
        };
    }

    private function poll(Member $who, array $in): array
    {
        $since = $in['since'] ?? 0;
        $place = $in['place'] ?? '';
        [$x, $z] = [$in['x'] ?? 0, $in['z'] ?? 0];
        if (!is_int($since) || $since < 0 || !is_string($place) || preg_match(self::PLACE, $place) !== 1 || !is_int($x) || !is_int($z) || abs($x) > 10000 || abs($z) > 10000) {
            return self::error(400, 'INVALID_REQUEST');
        }
        $this->store->move($who, $place, $x, $z);
        $settings = $this->store->settings($who->tenantId);
        $rows = $settings['chatOn'] ? $this->store->inbox($who, $since) : [];
        $messages = array_map(static fn (array $r): array => [
            'id' => (int) $r['id'],
            'channel' => (string) $r['channel'],
            'from' => ['id' => (int) $r['sender_id'], 'name' => (string) $r['sender_name'], 'staff' => $r['sender_role'] === 'master'],
            'to' => $r['recipient_id'] === null ? null : (int) $r['recipient_id'],
            'body' => (string) $r['body'],
            'at' => substr((string) $r['created_at'], 0, 19),
        ], $rows);
        $cursor = $rows === [] ? $since : (int) end($rows)['id'];
        return self::ok([
            'cursor' => $cursor,
            'messages' => $messages,
            'room' => $this->store->room($who, $place),
            'blocked' => $this->store->blocked($who),
            'chatOn' => $settings['chatOn'],
            'privateOn' => $settings['privateOn'],
            'me' => ['id' => $who->id, 'name' => $who->name, 'cohort' => $who->cohort, 'master' => $who->isMaster()],
        ]);
    }

    private function send(Member $who, array $in): array
    {
        $channel = $in['channel'] ?? null;
        $body = ChatRules::body($in['body'] ?? null);
        if (!in_array($channel, ChatRules::CHANNELS, true) || $body === null) {
            return self::error(400, 'INVALID_REQUEST');
        }
        $settings = $this->store->settings($who->tenantId);
        if (!$settings['chatOn']) {
            return self::error(403, 'CHAT_OFF');
        }
        if ($channel === 'private' && !$settings['privateOn']) {
            return self::error(403, 'PRIVATE_OFF');
        }
        if ($this->store->sentLastMinute($who) >= ChatRules::RATE_PER_MINUTE) {
            return self::error(429, 'RATE_LIMITED');
        }
        if (ChatRules::blockedWord($body, $settings['words']) !== null) {
            return self::error(422, 'BLOCKED_WORD');
        }
        $recipient = null;
        $at = null;
        $place = '';
        if ($channel === 'private') {
            $other = $this->store->classmate($who, $in['to'] ?? null);
            if ($other === null) {
                return self::error(404, 'RECIPIENT_NOT_FOUND');
            }
            $recipient = $other->id;
        }
        if ($channel === 'near') {
            $at = $this->store->whereIs($who);
            if ($at === null) {
                return self::error(409, 'NOT_IN_PLACE');
            }
            $place = $at['place'];
        }
        $r = $this->store->send($who, $channel, $body, $place, $recipient, $at);
        return self::ok(['id' => $r['id']] + ($channel === 'near' ? ['delivered' => $r['delivered']] : []), 201);
    }

    private function block(Member $who, array $in): array
    {
        $other = $this->store->classmate($who, $in['id'] ?? null);
        if ($other === null || !is_bool($in['on'] ?? null)) {
            return self::error($other === null ? 404 : 400, $other === null ? 'RECIPIENT_NOT_FOUND' : 'INVALID_REQUEST');
        }
        $this->store->block($who, $other->id, $in['on']);
        return self::ok(['blocked' => $this->store->blocked($who)]);
    }

    private function report(Member $who, array $in): array
    {
        $message = $this->store->visible($who, $in['messageId'] ?? null);
        if ($message === null || (int) $message['sender_id'] === $who->id) {
            return self::error(404, 'MESSAGE_NOT_FOUND');
        }
        $this->store->report($who, (int) $message['id']);
        return self::ok(['reported' => true], 201);
    }

    private function settings(Member $who, array $in): array
    {
        if (!$who->isMaster()) {
            return self::error(403, 'FORBIDDEN');
        }
        if (!is_bool($in['chatOn'] ?? null) || !is_bool($in['privateOn'] ?? null) || !is_string($in['words'] ?? '') || mb_strlen((string) ($in['words'] ?? '')) > 2000) {
            return self::error(400, 'INVALID_REQUEST');
        }
        $words = ChatRules::words((string) ($in['words'] ?? ''));
        $this->store->saveSettings($who->tenantId, $in['chatOn'], $in['privateOn'], $words);
        return self::ok(['chatOn' => $in['chatOn'], 'privateOn' => $in['privateOn'], 'words' => $words]);
    }

    /** @return list<array<string, mixed>> */
    private function reports(Member $who): array
    {
        return array_map(static fn (array $r): array => [
            'id' => (int) $r['id'],
            'messageId' => (int) $r['message_id'],
            'channel' => (string) $r['channel'],
            'cohort' => (string) $r['cohort'],
            'body' => (string) $r['body'],
            'sender' => (string) $r['sender'],
            'reporter' => (string) $r['reporter'],
            'at' => (string) $r['created_at'],
        ], $this->store->openReports($who->tenantId));
    }

    private static function ok(array $data, int $status = 200): array
    {
        return [$status, ['status' => 'success', 'data' => $data]];
    }

    private static function error(int $status, string $code): array
    {
        return [$status, ['status' => 'error', 'error' => ['code' => $code]]];
    }
}
