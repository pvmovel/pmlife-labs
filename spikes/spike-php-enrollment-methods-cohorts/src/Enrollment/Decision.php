<?php
declare(strict_types=1);

namespace Spike\Enrollment\Enrollment;

/** O que um método de matrícula decide para um pedido: ativa na hora, aguarda o admin ou recusa (com o código). */
final class Decision
{
    public const ACTIVE = 'active';
    public const PENDING = 'pending';
    public const REFUSED = 'refused';

    private function __construct(public readonly string $outcome, public readonly ?string $error = null)
    {
    }

    public static function active(): self
    {
        return new self(self::ACTIVE);
    }

    public static function pending(): self
    {
        return new self(self::PENDING);
    }

    public static function refused(string $error): self
    {
        return new self(self::REFUSED, $error);
    }
}
