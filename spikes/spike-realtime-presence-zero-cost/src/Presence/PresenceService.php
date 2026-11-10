<?php
declare(strict_types=1);

namespace Spike\Presence;

/**
 * A batida do aluno: valida a posição, grava e devolve a sala, com o ritmo da próxima batida.
 * O ritmo é adaptativo (decisão do Pablo): 1 s enquanto o avatar anda e 5 s parado. O cliente decide pelo próprio
 * movimento; o servidor só sugere, e pode alargar o intervalo quando a conta estiver pesada.
 */
final class PresenceService
{
    public const MOVING_MS = 1000;
    public const IDLE_MS = 5000;
    /** A cidade tem até 200 unidades de lado; as posições chegam em décimos. */
    private const LIMIT = 2000;

    public function __construct(private readonly PresenceStore $store)
    {
    }

    /**
     * @param array<string, mixed> $body {x, z, ry, moving, since}
     * @return array{0: int, 1: array<string, mixed>}
     */
    public function beat(?Seat $seat, array $body): array
    {
        if ($seat === null) {
            return [401, ['status' => 'error', 'error' => ['code' => 'UNAUTHENTICATED']]];
        }
        $x = $body['x'] ?? null;
        $z = $body['z'] ?? null;
        $ry = $body['ry'] ?? null;
        $since = $body['since'] ?? null;
        if (!is_int($x) || !is_int($z) || !is_int($ry) || abs($x) > self::LIMIT || abs($z) > self::LIMIT || $ry < 0 || $ry >= 3600
            || ($since !== null && (!is_string($since) || preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/', $since) !== 1))) {
            return [400, ['status' => 'error', 'error' => ['code' => 'INVALID_REQUEST']]];
        }
        $this->store->beat($seat, $x, $z, $ry);
        $room = $this->store->room($seat, $since);
        $next = ($body['moving'] ?? false) === true ? self::MOVING_MS : self::IDLE_MS;
        return [200, ['status' => 'success', 'data' => $room + ['next' => $next]]];
    }
}
