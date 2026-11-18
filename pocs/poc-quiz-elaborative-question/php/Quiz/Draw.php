<?php
declare(strict_types=1);

namespace Poc\Quiz;

/**
 * O sorteio conferível: a tentativa guarda só a semente, e a ordem de tudo sai dela (o SHA-256 de "semente:etiqueta:id",
 * do menor para o maior). Assim a correção refaz o sorteio e confere que a resposta é das questões sorteadas, e uma
 * auditoria refaz a prova inteira a partir da semente, sem guardar a prova pronta.
 */
final class Draw
{
    /** Uma semente nova para a tentativa (31 bits, cabe no INT UNSIGNED). */
    public static function seed(): int
    {
        return random_int(1, 2147483647);
    }

    /**
     * Os ids na ordem da semente.
     *
     * @param list<int|string> $ids
     * @return list<int|string>
     */
    public static function order(int $seed, string $tag, array $ids): array
    {
        $keyed = [];
        foreach ($ids as $id) {
            $keyed[] = [hash('sha256', "{$seed}:{$tag}:{$id}"), $id];
        }
        usort($keyed, static fn (array $a, array $b): int => [$a[0], (string) $a[1]] <=> [$b[0], (string) $b[1]]);
        return array_column($keyed, 1);
    }

    /**
     * As N questões sorteadas, já na ordem da prova.
     *
     * @param list<int> $questionIds
     * @return list<int>
     */
    public static function questions(int $seed, array $questionIds, int $count): array
    {
        return array_map('intval', array_slice(self::order($seed, 'q', $questionIds), 0, $count));
    }
}
