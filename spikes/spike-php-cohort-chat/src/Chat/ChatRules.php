<?php
declare(strict_types=1);

namespace Spike\Chat;

/**
 * As regras puras do chat, sem banco:
 * - os canais: `cohort` (a turma inteira, em qualquer cidade do curso), `near` (quem está a até 5 m, no mesmo lugar) e
 *   `private` (um colega da mesma turma);
 * - o texto: de 1 a 500 caracteres, sem caracteres de controle (a quebra de linha fica);
 * - o filtro de palavras da instituição: sem diferença de maiúsculas e acentos, só a palavra inteira;
 * - a distância (em decímetros, como a presença) e a guarda (90 dias; a denunciada até a denúncia ser resolvida e mais
 *   1 ano).
 */
final class ChatRules
{
    public const CHANNELS = ['cohort', 'near', 'private'];
    public const BODY_MAX = 500;
    /** O raio do "perto", em decímetros (5 m). */
    public const NEAR_DM = 50;
    /** Quem não bate há esse tempo saiu do lugar (o mesmo da presença). */
    public const SEEN_SECONDS = 15;
    /** O limite de mensagens por pessoa por minuto. */
    public const RATE_PER_MINUTE = 10;
    /** A guarda das mensagens. */
    public const KEEP_DAYS = 90;
    /** A guarda da mensagem denunciada depois de a denúncia ser resolvida. */
    public const KEEP_REPORTED_DAYS = 365;
    /** A entrega espera a mensagem ter esse tempo: uma gravação no mesmo instante da leitura não se perde (US41). */
    public const DELIVERY_DELAY_MS = 250;
    public const MAX_WORDS = 100;

    /** O texto limpo, ou null se for vazio, longo demais ou tiver caractere de controle. */
    public static function body(mixed $v): ?string
    {
        if (!is_string($v)) {
            return null;
        }
        $v = trim(str_replace("\r\n", "\n", $v));
        if ($v === '' || mb_strlen($v) > self::BODY_MAX || preg_match('/[\x00-\x09\x0B-\x1F\x7F]/u', $v) === 1 || !mb_check_encoding($v, 'UTF-8')) {
            return null;
        }
        return $v;
    }

    /** Minúsculas e sem acentos, para comparar palavras. */
    public static function fold(string $text): string
    {
        $map = ['á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'í' => 'i', 'ì' => 'i', 'î' => 'i', 'ï' => 'i',
            'ó' => 'o', 'ò' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o', 'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'ñ' => 'n'];
        return strtr(mb_strtolower($text), $map);
    }

    /**
     * A lista de palavras da instituição, limpa: uma por linha ou separadas por vírgula, até 100, só letras e números.
     *
     * @return list<string>
     */
    public static function words(string $raw): array
    {
        $out = [];
        foreach (preg_split('/[\n,]+/', $raw) ?: [] as $w) {
            $w = self::fold(trim($w));
            if ($w !== '' && preg_match('/^[\p{L}\p{N}][\p{L}\p{N} -]{0,39}$/u', $w) === 1) {
                $out[$w] = true;
            }
        }
        return array_slice(array_keys($out), 0, self::MAX_WORDS);
    }

    /**
     * A primeira palavra da lista que aparece inteira no texto, ou null.
     *
     * @param list<string> $words
     */
    public static function blockedWord(string $text, array $words): ?string
    {
        $folded = self::fold($text);
        foreach ($words as $w) {
            if (preg_match('/(?<![\p{L}\p{N}])' . preg_quote($w, '/') . '(?![\p{L}\p{N}])/u', $folded) === 1) {
                return $w;
            }
        }
        return null;
    }

    /** Duas posições (em decímetros) estão a até 5 m. */
    public static function near(int $x1, int $z1, int $x2, int $z2): bool
    {
        return ($x1 - $x2) ** 2 + ($z1 - $z2) ** 2 <= self::NEAR_DM ** 2;
    }
}
