<?php
declare(strict_types=1);

namespace Spike\Enrollment\Enrollment;

use RuntimeException;

/** Um pedido recusado, com o código estável e o status HTTP do contrato. */
final class EnrollmentRejected extends RuntimeException
{
    public function __construct(public readonly string $reason, public readonly int $status)
    {
        parent::__construct($reason);
    }
}
