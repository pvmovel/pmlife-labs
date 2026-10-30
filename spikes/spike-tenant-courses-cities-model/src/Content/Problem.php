<?php
declare(strict_types=1);

namespace Spike\Courses\Content;

/**
 * Um problema de um documento (sede, curso ou camada): um código estável (a tela traduz pelo i18n), onde ele está, em
 * JSON Pointer (RFC 6901, ex.: "/phases/0/quests/2/buildingId"), e às vezes um parâmetro (o papel do prédio que
 * falta, por exemplo). Nunca um texto pronto: a mesma lista serve à API, ao editor do admin (US37) e aos casos de
 * conformidade que o domínio TypeScript também roda.
 */
final class Problem
{
    public function __construct(public readonly string $code, public readonly string $path, public readonly ?string $param = null)
    {
    }

    /** @return array{code: string, path: string, param?: string} */
    public function toArray(): array
    {
        $out = ['code' => $this->code, 'path' => $this->path];
        if ($this->param !== null) {
            $out['param'] = $this->param;
        }
        return $out;
    }

    /** "CODIGO@/caminho" ou "CODIGO(param)@/caminho": a forma curta usada nos casos de conformidade. */
    public function key(): string
    {
        return $this->code . ($this->param === null ? '' : "({$this->param})") . '@' . $this->path;
    }
}
