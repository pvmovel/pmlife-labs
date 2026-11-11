<?php
declare(strict_types=1);

namespace Spike\Notices;

/**
 * O mural de um lugar: ler (com a versão da lista, no idioma do aluno) e publicar, corrigir ou apagar (só quem pode). Toda
 * resposta é [status, corpo, cabeçalhos]. A instituição vem só de quem pede (a sessão), nunca do pedido.
 */
final class NoticeService
{
    public function __construct(private readonly NoticeStore $store)
    {
    }

    /**
     * A leitura com a versão na resposta: o cliente devolve a última versão que viu (`known`), e, se nada mudou, a
     * resposta é só `unchanged: true`. A versão vai no CORPO, não num ETag: na hospedagem com a CDN na frente, o
     * cabeçalho ETag não chega ao navegador (achado do smoke do labs; nem o HTML estático o traz).
     *
     * @return array{0: int, 1: array<string, mixed>, 2: array<string, string>}
     */
    public function read(?Author $who, mixed $place, mixed $language, mixed $known): array
    {
        if ($who === null) {
            return [401, self::error('UNAUTHENTICATED'), []];
        }
        if (!NoticeRules::validPlace($place) || !in_array($language, NoticeRules::LANGUAGES, true) || !($known === null || (is_string($known) && preg_match('/^[a-f0-9]{32}$/', $known) === 1))) {
            return [400, self::error('INVALID_REQUEST'), []];
        }
        $rows = $this->store->list($who->tenantId, $place);
        $version = NoticeRules::version($rows, $language);
        // no-store: o navegador nunca guarda; o que evita baixar de novo é a versão (o aviso corrigido chega na abertura
        // seguinte, sem Ctrl+F5).
        $headers = ['Cache-Control' => 'no-store'];
        $base = ['place' => $place, 'language' => $language, 'version' => $version, 'canPublish' => NoticeRules::canPublish($who, $place)];
        if ($known === $version) {
            return [200, ['status' => 'success', 'data' => $base + ['unchanged' => true]], $headers];
        }
        $items = array_map(static fn (array $r): array => NoticeRules::pick($r, $language), $rows);
        return [200, ['status' => 'success', 'data' => $base + ['unchanged' => false, 'notices' => $items]], $headers];
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
