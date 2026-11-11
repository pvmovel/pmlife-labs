<?php
declare(strict_types=1);

namespace Spike\Notices;

/**
 * O mural de um lugar: ler (com ETag e 304, no idioma do aluno) e publicar, corrigir ou apagar (só quem pode). Toda
 * resposta é [status, corpo, cabeçalhos]. A instituição vem só de quem pede (a sessão), nunca do pedido.
 */
final class NoticeService
{
    public function __construct(private readonly NoticeStore $store)
    {
    }

    /** @return array{0: int, 1: ?array<string, mixed>, 2: array<string, string>} */
    public function read(?Author $who, mixed $place, mixed $language, ?string $ifNoneMatch): array
    {
        if ($who === null) {
            return [401, self::error('UNAUTHENTICATED'), []];
        }
        if (!NoticeRules::validPlace($place) || !in_array($language, NoticeRules::LANGUAGES, true)) {
            return [400, self::error('INVALID_REQUEST'), []];
        }
        $rows = $this->store->list($who->tenantId, $place);
        $etag = NoticeRules::etag($rows, $language);
        // no-cache: o navegador guarda, mas pergunta toda vez; a resposta 304 não tem corpo (o aviso corrigido chega na
        // abertura seguinte, sem Ctrl+F5).
        $headers = ['ETag' => $etag, 'Cache-Control' => 'no-cache'];
        // A CDN pode entregar o ETag como fraco (W/"..."), e o navegador o devolve assim: vale o mesmo valor.
        if ($ifNoneMatch !== null && in_array($etag, array_map(static fn (string $t): string => preg_replace('/^W\//', '', trim($t)) ?? '', explode(',', $ifNoneMatch)), true)) {
            return [304, null, $headers];
        }
        $items = array_map(static fn (array $r): array => NoticeRules::pick($r, $language), $rows);
        return [200, ['status' => 'success', 'data' => ['place' => $place, 'language' => $language, 'canPublish' => NoticeRules::canPublish($who, $place), 'notices' => $items]], $headers];
    }

    /**
     * @param array<string, mixed> $in {action: "create"|"update"|"delete", id?, place, title?, body?, pinned?}
     * @return array{0: int, 1: array<string, mixed>, 2: array<string, string>}
     */
    public function write(?Author $who, array $in): array
    {
        if ($who === null) {
            return [401, self::error('UNAUTHENTICATED'), []];
        }
        $action = $in['action'] ?? null;
        $place = $in['place'] ?? null;
        if (!in_array($action, ['create', 'update', 'delete'], true) || !NoticeRules::validPlace($place)) {
            return [400, self::error('INVALID_REQUEST'), []];
        }
        if (!NoticeRules::canPublish($who, $place)) {
            return [403, self::error('FORBIDDEN'), []];
        }
        $id = $in['id'] ?? null;
        if ($action !== 'create' && (!is_int($id) || $id < 1)) {
            return [400, self::error('INVALID_REQUEST'), []];
        }
        if ($action === 'delete') {
            return $this->store->delete($who->tenantId, $id, $place) ? [200, self::ok(['deleted' => $id]), []] : [404, self::error('NOTICE_NOT_FOUND'), []];
        }
        [$notice, $errors] = NoticeRules::validate($in);
        if ($notice === null) {
            return [422, ['status' => 'error', 'error' => ['code' => 'NOTICE_INVALID', 'fields' => $errors]], []];
        }
        if ($action === 'create') {
            return [201, self::ok(['id' => $this->store->create($who->tenantId, $notice, $who->name)]), []];
        }
        return $this->store->update($who->tenantId, $id, $notice) ? [200, self::ok(['id' => $id]), []] : [404, self::error('NOTICE_NOT_FOUND'), []];
    }

    private static function ok(array $data): array
    {
        return ['status' => 'success', 'data' => $data];
    }

    private static function error(string $code): array
    {
        return ['status' => 'error', 'error' => ['code' => $code]];
    }
}
