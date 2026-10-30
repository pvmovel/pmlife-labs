<?php
declare(strict_types=1);

namespace Spike\Courses\Courses;

use Spike\Courses\Content\CourseId;
use Spike\Courses\Content\Json;

/**
 * O que é da plataforma: os cursos-modelo e a sede padrão, em documentos versionados no repositório
 * (platform/courses/<id>/v<N>.json e platform/headquarters/v<N>.json), validados no CI e copiados pelo build. Uma
 * versão publicada nunca muda (é um arquivo novo): a instituição vinculada pode ficar numa versão anterior enquanto a
 * camada dela não mescla com a nova.
 */
final class PlatformCatalog
{
    public function __construct(private readonly string $dir)
    {
    }

    /** @return list<string> */
    public function courseIds(): array
    {
        $ids = array_map('basename', glob($this->dir . '/courses/*', GLOB_ONLYDIR) ?: []);
        sort($ids);
        return array_values(array_filter($ids, [CourseId::class, 'isPlatform']));
    }

    public function latestCourseVersion(string $courseId): ?int
    {
        return CourseId::isPlatform($courseId) ? self::latest("{$this->dir}/courses/{$courseId}") : null;
    }

    /** @return array{version: int, content: string, sha256: string}|null */
    public function course(string $courseId, int $version): ?array
    {
        return CourseId::isPlatform($courseId) ? self::read("{$this->dir}/courses/{$courseId}", $version) : null;
    }

    /** @return array{version: int, content: string, sha256: string} a sede de quem ainda não publicou a sua */
    public function headquarters(): array
    {
        $dir = "{$this->dir}/headquarters";
        return self::read($dir, (int) self::latest($dir)) ?? throw new \RuntimeException('sem sede padrão');
    }

    private static function latest(string $dir): ?int
    {
        $versions = array_map(static fn (string $f): int => (int) substr(basename($f, '.json'), 1), glob("{$dir}/v*.json") ?: []);
        return $versions === [] ? null : max($versions);
    }

    /** @return array{version: int, content: string, sha256: string}|null */
    private static function read(string $dir, int $version): ?array
    {
        $file = "{$dir}/v{$version}.json";
        if ($version < 1 || !is_file($file)) {
            return null;
        }
        $content = Json::canonical((string) file_get_contents($file));
        return ['version' => $version, 'content' => $content, 'sha256' => hash('sha256', $content)];
    }
}
