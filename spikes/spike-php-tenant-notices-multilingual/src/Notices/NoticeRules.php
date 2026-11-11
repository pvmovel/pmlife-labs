<?php
declare(strict_types=1);

namespace Spike\Notices;

/**
 * As regras puras dos avisos, sem banco:
 * - o lugar: a sede (`hq`), a cidade de um curso (`course:<curso>`) ou uma fase (`phase:<curso>:<fase>`);
 * - o texto: título e corpo em pt-BR obrigatórios; o en-US é opcional, mas vem inteiro (título e corpo) ou não vem;
 * - quem publica: o master da instituição em qualquer lugar; o autor de um curso só na cidade e nas fases dele;
 * - o idioma da leitura: o pedido, ou o pt com a marca de recuo quando o aviso não tem en;
 * - a versão da lista, que muda com qualquer aviso novo, corrigido ou apagado.
 * O corpo é Markdown e fica cru no banco: o HTML só nasce no navegador, higienizado (marked + DOMPurify).
 */
final class NoticeRules
{
    public const TITLE_MAX = 120;
    public const BODY_MAX = 20000;
    public const LANGUAGES = ['pt-BR', 'en-US'];
    private const ID = '[a-z0-9][a-z0-9.-]{0,39}';

    public static function validPlace(mixed $place): bool
    {
        return is_string($place) && preg_match('/^(hq|course:' . self::ID . '|phase:' . self::ID . ':' . self::ID . ')$/', $place) === 1;
    }

    /** O curso do lugar, ou null na sede. */
    public static function courseOf(string $place): ?string
    {
        return str_starts_with($place, 'hq') ? null : explode(':', $place)[1];
    }

    public static function canPublish(Author $who, string $place): bool
    {
        if ($who->role === 'master') {
            return true;
        }
        $course = self::courseOf($place);
        return $who->role === 'author' && $course !== null && in_array($course, $who->courses, true);
    }

    /**
     * @param array<string, mixed> $in {place, title: {pt-BR, en-US?}, body: {pt-BR, en-US?}, pinned?}
     * @return array{0: ?array{place: string, title_pt: string, body_pt: string, title_en: ?string, body_en: ?string, pinned: bool}, 1: array<string, string>} o aviso normalizado, ou os campos com o motivo
     */
    public static function validate(array $in): array
    {
        $errors = [];
        $text = static function (mixed $v, int $max): ?string {
            if (!is_string($v)) {
                return null;
            }
            $v = trim(str_replace("\r\n", "\n", $v));
            return $v === '' || mb_strlen($v) > $max ? null : $v;
        };
        if (!self::validPlace($in['place'] ?? null)) {
            $errors['place'] = 'PLACE_INVALID';
        }
        $title = is_array($in['title'] ?? null) ? $in['title'] : [];
        $body = is_array($in['body'] ?? null) ? $in['body'] : [];
        $titlePt = $text($title['pt-BR'] ?? null, self::TITLE_MAX);
        $bodyPt = $text($body['pt-BR'] ?? null, self::BODY_MAX);
        if ($titlePt === null) {
            $errors['title.pt-BR'] = 'REQUIRED_OR_TOO_LONG';
        }
        if ($bodyPt === null) {
            $errors['body.pt-BR'] = 'REQUIRED_OR_TOO_LONG';
        }
        $hasEn = ($title['en-US'] ?? '') !== '' || ($body['en-US'] ?? '') !== '';
        $titleEn = $hasEn ? $text($title['en-US'] ?? null, self::TITLE_MAX) : null;
        $bodyEn = $hasEn ? $text($body['en-US'] ?? null, self::BODY_MAX) : null;
        if ($hasEn && ($titleEn === null || $bodyEn === null)) {
            $errors['en-US'] = 'EN_INCOMPLETE';
        }
        if (isset($in['pinned']) && !is_bool($in['pinned'])) {
            $errors['pinned'] = 'NOT_BOOLEAN';
        }
        if ($errors !== []) {
            return [null, $errors];
        }
        return [['place' => (string) $in['place'], 'title_pt' => $titlePt, 'body_pt' => $bodyPt, 'title_en' => $titleEn, 'body_en' => $bodyEn, 'pinned' => ($in['pinned'] ?? false) === true], []];
    }

    /**
     * O aviso no idioma da leitura: o pedido, ou o pt com `fallback` quando o aviso não tem en.
     *
     * @param array<string, mixed> $row a linha do banco
     * @return array{id: int, title: string, body: string, language: string, fallback: bool, pinned: bool, author: string, publishedAt: string, updatedAt: string}
     */
    public static function pick(array $row, string $language): array
    {
        $en = $language === 'en-US' && $row['title_en'] !== null;
        return [
            'id' => (int) $row['id'],
            'title' => (string) ($en ? $row['title_en'] : $row['title_pt']),
            'body' => (string) ($en ? $row['body_en'] : $row['body_pt']),
            'language' => $en ? 'en-US' : 'pt-BR',
            'fallback' => $language === 'en-US' && !$en,
            'pinned' => (bool) $row['pinned'],
            'author' => (string) $row['author'],
            'publishedAt' => (string) $row['published_at'],
            'updatedAt' => (string) $row['updated_at'],
        ];
    }

    /**
     * A versão da lista no idioma: muda com qualquer aviso novo, corrigido ou apagado (os ids e as horas de cada um).
     *
     * @param list<array<string, mixed>> $rows
     */
    public static function version(array $rows, string $language): string
    {
        $marks = array_map(static fn (array $r): string => $r['id'] . '@' . $r['updated_at'], $rows);
        return substr(hash('sha256', $language . '|' . implode(',', $marks)), 0, 32);
    }
}
