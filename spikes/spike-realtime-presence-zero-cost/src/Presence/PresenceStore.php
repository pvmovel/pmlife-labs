<?php
declare(strict_types=1);

namespace Spike\Presence;

use PDO;

/**
 * A tabela de presença no MySQL 5.7: uma linha por aluno, com upsert a cada batida, e a leitura da sala (mesma
 * instituição, cidade e turma) só com quem foi visto nos últimos segundos. As posições vão em décimos de unidade
 * (SMALLINT), para a resposta ficar pequena. O relógio é o do banco (NOW(3)), então o cursor do cliente nunca
 * depende do relógio do aparelho.
 */
final class PresenceStore
{
    /** Quem não bateu nesse tempo saiu da sala (a batida parada é a cada 5 s; 3 batidas perdidas = saiu). */
    public const TTL_SECONDS = 15;
    /**
     * A folga do cursor: quem andou até 250 ms antes dele volta na resposta. O cursor é a hora do banco em
     * milissegundos; um colega que anda no mesmo milissegundo, ou cuja gravação termina logo depois da leitura, ficaria
     * com o `moved_at` igual ou um pouco antes do cursor e se perderia (achado do CI, numa máquina rápida). Reenviar a
     * mesma posição não muda nada na tela: o colega continua deslizando para o mesmo lugar.
     */
    public const CURSOR_OVERLAP_MS = 250;

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Grava a batida. `moved_at` só muda quando a posição ou a rotação mudam: é o que faz a resposta dos outros levar
     * só quem andou (a batida parada só renova o `seen_at`).
     */
    public function beat(Seat $seat, int $x, int $z, int $ry): void
    {
        $this->pdo->prepare(
            'INSERT INTO spike_presence (tenant_id, user_id, city, cohort, name, staff, visible, x, z, ry, seen_at, moved_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
             ON DUPLICATE KEY UPDATE
                moved_at = IF(spike_presence.x <> VALUES(x) OR spike_presence.z <> VALUES(z) OR spike_presence.ry <> VALUES(ry)
                              OR spike_presence.city <> VALUES(city) OR spike_presence.visible <> VALUES(visible), NOW(3), spike_presence.moved_at),
                city = VALUES(city), cohort = VALUES(cohort), name = VALUES(name), staff = VALUES(staff), visible = VALUES(visible),
                x = VALUES(x), z = VALUES(z), ry = VALUES(ry), seen_at = NOW(3)'
        )->execute([$seat->tenantId, $seat->userId, $seat->city, $seat->cohort, $seat->name, $seat->staff ? 1 : 0, $seat->visible ? 1 : 0, $x, $z, $ry]);
    }

    /**
     * A sala de quem pediu: os ids de todos os presentes (para o cliente tirar quem saiu) e os dados só de quem andou
     * depois do cursor. Quem está invisível (o master observando) não aparece para os outros.
     *
     * @return array{now: string, ids: list<int>, moved: list<array{id: int, n: string, s: int, x: int, z: int, r: int}>}
     */
    public function room(Seat $seat, ?string $since): array
    {
        $now = (string) $this->pdo->query('SELECT NOW(3)')->fetchColumn();
        $stmt = $this->pdo->prepare(
            'SELECT user_id, name, staff, x, z, ry, moved_at FROM spike_presence
              WHERE tenant_id = ? AND city = ? AND cohort = ? AND seen_at > (NOW(3) - INTERVAL ' . self::TTL_SECONDS . ' SECOND)
                AND visible = 1 AND user_id <> ?'
        );
        $stmt->execute([$seat->tenantId, $seat->city, $seat->cohort, $seat->userId]);
        $ids = [];
        $moved = [];
        $cut = $since === null ? null : self::overlap($since);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $ids[] = (int) $r['user_id'];
            if ($cut === null || strcmp((string) $r['moved_at'], $cut) > 0) {
                $moved[] = ['id' => (int) $r['user_id'], 'n' => (string) $r['name'], 's' => (int) $r['staff'], 'x' => (int) $r['x'], 'z' => (int) $r['z'], 'r' => (int) $r['ry']];
            }
        }
        return ['now' => $now, 'ids' => $ids, 'moved' => $moved];
    }

    /** O cursor menos a folga, no mesmo formato da hora do banco (AAAA-MM-DD HH:MM:SS.mmm). */
    private static function overlap(string $since): string
    {
        $at = \DateTimeImmutable::createFromFormat('Y-m-d H:i:s.v', $since);
        return $at === false ? $since : $at->modify('-' . self::CURSOR_OVERLAP_MS . ' milliseconds')->format('Y-m-d H:i:s.v');
    }

    /** Some com a linha (o aluno saiu da cidade ou fechou a aba com o sendBeacon). */
    public function leave(Seat $seat): void
    {
        $this->pdo->prepare('DELETE FROM spike_presence WHERE tenant_id = ? AND user_id = ?')->execute([$seat->tenantId, $seat->userId]);
    }

    /** A limpeza das linhas velhas (no produto, no Cron; aqui, na entrada da demo). */
    public function purge(int $olderThanSeconds): int
    {
        $stmt = $this->pdo->prepare('DELETE FROM spike_presence WHERE seen_at < (NOW(3) - INTERVAL ? SECOND)');
        $stmt->execute([$olderThanSeconds]);
        return $stmt->rowCount();
    }
}
