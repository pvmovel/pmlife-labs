<?php
declare(strict_types=1);

namespace Spike\Chat;

use PDO;

/**
 * As tabelas do chat, sempre com a instituição e a turma de quem pede no filtro (no produto, o banco já é o da
 * instituição). Quem pode ver cada mensagem é decidido aqui, no servidor: o cliente só recebe o que é dele.
 */
final class ChatStore
{
    public const COURSE = 'dev-to-pm';
    public const PAGE = 100;

    public function __construct(private readonly PDO $pdo)
    {
    }

    public function person(int $id): ?Member
    {
        $stmt = $this->pdo->prepare('SELECT id, tenant_id, cohort, name, role FROM spike_chat_people WHERE id = ?');
        $stmt->execute([$id]);
        $r = $stmt->fetch(PDO::FETCH_ASSOC);
        return $r === false ? null : new Member((int) $r['id'], (int) $r['tenant_id'], (string) $r['cohort'], (string) $r['name'], (string) $r['role']);
    }

    public function addPerson(int $tenantId, string $cohort, string $name, string $role): int
    {
        $this->pdo->prepare('INSERT INTO spike_chat_people (tenant_id, cohort, name, role, seen_at, created_at) VALUES (?, ?, ?, ?, NOW(3), UTC_TIMESTAMP())')
            ->execute([$tenantId, $cohort, $name, $role]);
        return (int) $this->pdo->lastInsertId();
    }

    /** Onde a pessoa está agora (no produto, a batida da presença). */
    public function move(Member $m, string $place, int $x, int $z): void
    {
        $this->pdo->prepare('UPDATE spike_chat_people SET place = ?, x = ?, z = ?, seen_at = NOW(3) WHERE id = ?')->execute([$place, $x, $z, $m->id]);
    }

    /** @return list<array{id: int, name: string, staff: bool, x: int, z: int}> quem está no mesmo lugar, na mesma turma */
    public function room(Member $m, string $place): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id, name, role, x, z FROM spike_chat_people
              WHERE tenant_id = ? AND cohort = ? AND place = ? AND seen_at > (NOW(3) - INTERVAL ' . ChatRules::SEEN_SECONDS . ' SECOND) ORDER BY id'
        );
        $stmt->execute([$m->tenantId, $m->cohort, $place]);
        return array_map(static fn (array $r): array => ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'staff' => $r['role'] === 'master', 'x' => (int) $r['x'], 'z' => (int) $r['z']], $stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    /** @return array{chatOn: bool, privateOn: bool, words: list<string>} o chat do curso (sem linha: ligado, privado desligado) */
    public function settings(int $tenantId): array
    {
        $stmt = $this->pdo->prepare('SELECT chat_on, private_on, words FROM spike_chat_settings WHERE tenant_id = ? AND course = ?');
        $stmt->execute([$tenantId, self::COURSE]);
        $r = $stmt->fetch(PDO::FETCH_ASSOC);
        return $r === false ? ['chatOn' => true, 'privateOn' => false, 'words' => []] : ['chatOn' => (bool) $r['chat_on'], 'privateOn' => (bool) $r['private_on'], 'words' => ChatRules::words((string) $r['words'])];
    }

    /** @param list<string> $words */
    public function saveSettings(int $tenantId, bool $chatOn, bool $privateOn, array $words): void
    {
        $this->pdo->prepare(
            'INSERT INTO spike_chat_settings (tenant_id, course, chat_on, private_on, words) VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE chat_on = VALUES(chat_on), private_on = VALUES(private_on), words = VALUES(words)'
        )->execute([$tenantId, self::COURSE, $chatOn ? 1 : 0, $privateOn ? 1 : 0, implode("\n", $words)]);
    }

    /** Quantas mensagens a pessoa mandou no último minuto. */
    public function sentLastMinute(Member $m): int
    {
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM spike_chat_messages WHERE sender_id = ? AND created_at > (NOW(3) - INTERVAL 60 SECOND)');
        $stmt->execute([$m->id]);
        return (int) $stmt->fetchColumn();
    }

    /** A posição de agora de quem manda, se ele está num lugar (visto nos últimos 15 s). */
    public function whereIs(Member $m): ?array
    {
        $stmt = $this->pdo->prepare('SELECT place, x, z FROM spike_chat_people WHERE id = ? AND seen_at > (NOW(3) - INTERVAL ' . ChatRules::SEEN_SECONDS . ' SECOND)');
        $stmt->execute([$m->id]);
        $r = $stmt->fetch(PDO::FETCH_ASSOC);
        return $r === false ? null : ['place' => (string) $r['place'], 'x' => (int) $r['x'], 'z' => (int) $r['z']];
    }

    /** Um colega da mesma turma (o destino do privado), ou null. */
    public function classmate(Member $m, mixed $id): ?Member
    {
        if (!is_int($id) || $id < 1 || $id === $m->id) {
            return null;
        }
        $other = $this->person($id);
        return $other !== null && $other->tenantId === $m->tenantId && $other->cohort === $m->cohort ? $other : null;
    }

    /**
     * Grava a mensagem e, no "perto", decide no envio quem recebe: quem está no mesmo lugar, na mesma turma, a até 5 m.
     *
     * @return array{id: int, delivered: int}
     */
    public function send(Member $m, string $channel, string $body, string $place, ?int $recipient, ?array $at): array
    {
        $this->pdo->beginTransaction();
        try {
            $this->pdo->prepare(
                'INSERT INTO spike_chat_messages (tenant_id, cohort, channel, place, sender_id, recipient_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3))'
            )->execute([$m->tenantId, $m->cohort, $channel, $place, $m->id, $recipient, $body]);
            $id = (int) $this->pdo->lastInsertId();
            $delivered = 0;
            if ($channel === 'near' && $at !== null) {
                $insert = $this->pdo->prepare('INSERT INTO spike_chat_deliveries (user_id, message_id) VALUES (?, ?)');
                foreach ($this->room($m, $place) as $p) {
                    if ($p['id'] !== $m->id && ChatRules::near($at['x'], $at['z'], $p['x'], $p['z'])) {
                        $insert->execute([$p['id'], $id]);
                        $delivered++;
                    }
                }
            }
            $this->pdo->commit();
            return ['id' => $id, 'delivered' => $delivered];
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /**
     * As mensagens que a pessoa pode ver depois do cursor: a turma dela; o "perto" entregue a ela; o privado dela; e as
     * próprias. Some quem ela bloqueou. Só as que já têm 250 ms (a entrega nunca passa por cima de uma gravação em curso).
     *
     * @return list<array<string, mixed>>
     */
    public function inbox(Member $m, int $since): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT msg.id, msg.channel, msg.place, msg.sender_id, s.name AS sender_name, s.role AS sender_role, msg.recipient_id, msg.body, msg.created_at
               FROM spike_chat_messages msg JOIN spike_chat_people s ON s.id = msg.sender_id
              WHERE msg.tenant_id = ? AND msg.cohort = ? AND msg.id > ?
                AND msg.created_at <= (NOW(3) - INTERVAL ' . (ChatRules::DELIVERY_DELAY_MS * 1000) . ' MICROSECOND)
                AND (msg.sender_id = ?
                     OR msg.channel = \'cohort\'
                     OR (msg.channel = \'private\' AND msg.recipient_id = ?)
                     OR (msg.channel = \'near\' AND EXISTS (SELECT 1 FROM spike_chat_deliveries d WHERE d.user_id = ? AND d.message_id = msg.id)))
                AND NOT EXISTS (SELECT 1 FROM spike_chat_blocks b WHERE b.blocker_id = ? AND b.blocked_id = msg.sender_id)
              ORDER BY msg.id LIMIT ' . self::PAGE
        );
        $stmt->execute([$m->tenantId, $m->cohort, $since, $m->id, $m->id, $m->id, $m->id]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /** A mensagem, se a pessoa pode vê-la (para denunciar só o que chegou a ela). */
    public function visible(Member $m, mixed $messageId): ?array
    {
        if (!is_int($messageId) || $messageId < 1) {
            return null;
        }
        foreach ($this->inbox($m, $messageId - 1) as $row) {
            if ((int) $row['id'] === $messageId) {
                return $row;
            }
        }
        return null;
    }

    public function block(Member $m, int $other, bool $on): void
    {
        $on
            ? $this->pdo->prepare('INSERT IGNORE INTO spike_chat_blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, UTC_TIMESTAMP())')->execute([$m->id, $other])
            : $this->pdo->prepare('DELETE FROM spike_chat_blocks WHERE blocker_id = ? AND blocked_id = ?')->execute([$m->id, $other]);
    }

    /** @return list<int> quem a pessoa bloqueou */
    public function blocked(Member $m): array
    {
        $stmt = $this->pdo->prepare('SELECT blocked_id FROM spike_chat_blocks WHERE blocker_id = ? ORDER BY blocked_id');
        $stmt->execute([$m->id]);
        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }

    public function report(Member $m, int $messageId): void
    {
        $this->pdo->prepare('INSERT IGNORE INTO spike_chat_reports (tenant_id, message_id, reporter_id, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())')
            ->execute([$m->tenantId, $messageId, $m->id]);
    }

    /** @return list<array<string, mixed>> as denúncias abertas da instituição, com a mensagem e quem mandou */
    public function openReports(int $tenantId): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT r.id, r.created_at, msg.id AS message_id, msg.channel, msg.cohort, msg.body, s.name AS sender, rep.name AS reporter
               FROM spike_chat_reports r JOIN spike_chat_messages msg ON msg.id = r.message_id
               JOIN spike_chat_people s ON s.id = msg.sender_id JOIN spike_chat_people rep ON rep.id = r.reporter_id
              WHERE r.tenant_id = ? AND r.status = 'open' ORDER BY r.id"
        );
        $stmt->execute([$tenantId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function resolve(int $tenantId, mixed $reportId): bool
    {
        if (!is_int($reportId) || $reportId < 1) {
            return false;
        }
        $stmt = $this->pdo->prepare("UPDATE spike_chat_reports SET status = 'resolved', resolved_at = UTC_TIMESTAMP() WHERE id = ? AND tenant_id = ? AND status = 'open'");
        $stmt->execute([$reportId, $tenantId]);
        return $stmt->rowCount() === 1;
    }

    /**
     * A guarda (no produto, um Cron diário): apaga as mensagens de mais de 90 dias, menos as denunciadas que ainda estão
     * abertas ou foram resolvidas há menos de 1 ano. Leva junto as entregas do "perto".
     *
     * @return int quantas mensagens saíram
     */
    public function purge(): int
    {
        $keep = "SELECT r.message_id FROM spike_chat_reports r
                  WHERE r.status = 'open' OR r.resolved_at > (UTC_TIMESTAMP() - INTERVAL " . ChatRules::KEEP_REPORTED_DAYS . ' DAY)';
        $old = 'created_at < (NOW(3) - INTERVAL ' . ChatRules::KEEP_DAYS . ' DAY)';
        $this->pdo->exec("DELETE d FROM spike_chat_deliveries d JOIN spike_chat_messages msg ON msg.id = d.message_id
                           WHERE msg.{$old} AND msg.id NOT IN ({$keep})");
        $n = $this->pdo->exec("DELETE FROM spike_chat_messages WHERE {$old} AND id NOT IN (SELECT message_id FROM ({$keep}) k)");
        $this->pdo->exec("DELETE r FROM spike_chat_reports r LEFT JOIN spike_chat_messages msg ON msg.id = r.message_id WHERE msg.id IS NULL");
        return (int) $n;
    }

    /** A limpeza da demo: tudo o que é fictício e tem mais de 1 dia some. */
    public function purgeDemo(): void
    {
        foreach (['spike_chat_deliveries d JOIN spike_chat_messages m ON m.id = d.message_id' => 'd', 'spike_chat_reports r JOIN spike_chat_messages m ON m.id = r.message_id' => 'r'] as $from => $alias) {
            $this->pdo->exec("DELETE {$alias} FROM {$from} WHERE m.created_at < (NOW(3) - INTERVAL 1 DAY)");
        }
        $this->pdo->exec('DELETE FROM spike_chat_messages WHERE created_at < (NOW(3) - INTERVAL 1 DAY)');
        $this->pdo->exec('DELETE b FROM spike_chat_blocks b JOIN spike_chat_people p ON p.id = b.blocker_id WHERE p.created_at < (UTC_TIMESTAMP() - INTERVAL 1 DAY)');
        $this->pdo->exec('DELETE FROM spike_chat_people WHERE created_at < (UTC_TIMESTAMP() - INTERVAL 1 DAY) AND id NOT IN (SELECT sender_id FROM (SELECT DISTINCT sender_id FROM spike_chat_messages) s)');
    }
}
