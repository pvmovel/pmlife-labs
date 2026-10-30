<?php
declare(strict_types=1);

namespace Spike\Courses\Courses;

use RuntimeException;
use Spike\Courses\Content\Problem;

/**
 * A operação foi recusada: FORBIDDEN, NOT_FOUND, CONTENT_TOO_LARGE ou CONTENT_INVALID. Numa camada, os problemas
 * podem estar na própria camada (problems, caminhos da camada) ou no curso mesclado (mergedProblems, caminhos do curso).
 */
final class PublishRejected extends RuntimeException
{
    /**
     * @param list<Problem> $problems
     * @param list<Problem> $mergedProblems
     */
    public function __construct(public readonly string $reason, public readonly array $problems = [], public readonly array $mergedProblems = [])
    {
        parent::__construct($reason);
    }
}
