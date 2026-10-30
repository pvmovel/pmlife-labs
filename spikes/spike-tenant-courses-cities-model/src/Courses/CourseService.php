<?php
declare(strict_types=1);

namespace Spike\Courses\Courses;

use DateTimeImmutable;
use JsonException;
use Spike\Courses\Content\CourseId;
use Spike\Courses\Content\DocumentValidator;
use Spike\Courses\Content\Json;
use Spike\Courses\Content\Overlay;
use Spike\Courses\Content\Problem;
use Spike\Courses\Tenant\TenantContext;

/**
 * A sede e os cursos que um aluno da instituição vê, e o que o admin da instituição publica (ADR-012).
 *
 * - Sede: a última publicada pela instituição ou, se ela ainda não publicou, a sede padrão da plataforma.
 * - Cursos visíveis: os da plataforma vinculados (na versão adotada, mesclada com a camada da instituição) e os da
 *   própria instituição com ao menos uma versão publicada (inclusive as cópias).
 * - Um curso de outra instituição, ou da plataforma sem vínculo, é "não encontrado" (nunca "proibido"): a resposta não
 *   revela que ele existe.
 * - Versão nova do curso-modelo: a instituição só a adota se a camada dela mescla sem problemas; senão continua na
 *   anterior e a nova fica pendente, com a lista de problemas para o admin (decisão do Pablo).
 */
final class CourseService
{
    public const HEADQUARTERS_SLUG = 'sede';

    public function __construct(
        private readonly DocumentRepository $docs,
        private readonly PlatformCatalog $platform,
        private readonly TenantContext $tenant,
    ) {
    }

    /** @return array{source: string, version: int, etag: string, content: string} */
    public function headquarters(): array
    {
        $own = $this->docs->latest('headquarters', self::HEADQUARTERS_SLUG);
        $doc = $own ?? $this->platform->headquarters();
        return ['source' => $own === null ? 'platform' : 'tenant', 'version' => $doc['version'], 'etag' => self::etag($doc['sha256']), 'content' => $doc['content']];
    }

    /** @return list<array<string, mixed>> */
    public function courses(): array
    {
        $out = [];
        foreach ($this->docs->links() as $link) {
            $course = $this->linked($link['courseId'], $link['adoptedVersion']);
            if ($course !== null) {
                $out[] = self::summary($course) + [
                    'pendingVersion' => $link['pendingVersion'],
                ];
            }
        }
        foreach ($this->docs->latestOfKind('course') as $v) {
            $id = (string) CourseId::forTenant($this->tenant->tenantSlug, $v['slug']);
            $out[] = self::summary(['courseId' => $id, 'source' => 'tenant', 'version' => $v['version'], 'overlayVersion' => null] + $v) + ['pendingVersion' => null];
        }
        return $out;
    }

    /** @return array{courseId: string, source: string, version: int, overlayVersion: int|null, etag: string, content: string}|null */
    public function course(string $courseId): ?array
    {
        if (CourseId::isPlatform($courseId)) {
            foreach ($this->docs->links() as $link) {
                if ($link['courseId'] === $courseId) {
                    $c = $this->linked($courseId, $link['adoptedVersion']);
                    return $c === null ? null : self::view($c);
                }
            }
            return null;
        }
        $parts = CourseId::split($courseId);
        if ($parts === null || $parts[0] !== $this->tenant->tenantSlug) {
            return null;
        }
        $v = $this->docs->latest('course', $parts[1]);
        return $v === null ? null : self::view(['courseId' => $courseId, 'source' => 'tenant', 'version' => $v['version'], 'overlayVersion' => null] + $v);
    }

    /**
     * O XP de cada missão do curso (todas as fases), para a sincronização do progresso validar o que o aluno manda.
     *
     * @return array<string, int>|null
     */
    public function questRewards(string $courseId): ?array
    {
        $course = $this->course($courseId);
        if ($course === null) {
            return null;
        }
        $rewards = [];
        foreach (Json::decode($course['content'])['phases'] as $phase) {
            foreach ($phase['quests'] as $q) {
                $rewards[$q['id']] = $q['rewardXp'];
            }
        }
        return $rewards;
    }

    /**
     * Publica uma versão da sede ("sede"), de um curso da instituição ("<slug>") ou da camada de um curso vinculado
     * ("<id do curso da plataforma>"). Só o admin.
     *
     * @param string $content o documento em JSON (é gravado na forma canônica)
     * @return array{kind: string, slug: string, version: int, created: bool, adoptedVersion?: int}
     * @throws PublishRejected
     */
    public function publish(string $kind, string $slug, string $content, DateTimeImmutable $now): array
    {
        $this->requireAdmin();
        if (strlen($content) > Json::MAX_BYTES) {
            throw new PublishRejected('CONTENT_TOO_LARGE');
        }
        try {
            $doc = Json::decode($content);
            $content = Json::canonical($content); // o que se grava e entra no hash: a formatação não cria versão nova
        } catch (JsonException) {
            throw new PublishRejected('CONTENT_INVALID', [new Problem('JSON_INVALID', '')]);
        }

        if ($kind === 'overlay') {
            return $this->publishOverlay($slug, $doc, $content, $now);
        }
        if ($kind === 'headquarters') {
            if ($slug !== self::HEADQUARTERS_SLUG) {
                throw new PublishRejected('CONTENT_INVALID', [new Problem('SLUG_INVALID', '')]);
            }
            $problems = DocumentValidator::validate($doc);
            if (is_array($doc) && ($doc['kind'] ?? null) !== 'headquarters') {
                array_unshift($problems, new Problem('KIND_MISMATCH', '/kind'));
            }
        } elseif ($kind === 'course') {
            $courseId = CourseId::forTenant($this->tenant->tenantSlug, $slug);
            if ($courseId === null) {
                throw new PublishRejected('CONTENT_INVALID', [new Problem('SLUG_INVALID', '')]);
            }
            $problems = DocumentValidator::validate($doc);
            if (is_array($doc) && ($doc['kind'] ?? null) !== 'course') {
                array_unshift($problems, new Problem('KIND_MISMATCH', '/kind'));
            } elseif (is_array($doc) && ($doc['courseId'] ?? null) !== $courseId) {
                array_unshift($problems, new Problem('COURSE_ID_MISMATCH', '/courseId'));
            }
        } else {
            throw new PublishRejected('CONTENT_INVALID', [new Problem('KIND_UNSUPPORTED', '')]);
        }
        if ($problems !== []) {
            throw new PublishRejected('CONTENT_INVALID', $problems);
        }
        $r = $this->docs->publish($kind, $slug, $content, hash('sha256', $content), $now);
        return ['kind' => $kind, 'slug' => $slug, 'version' => $r['version'], 'created' => $r['created']];
    }

    /** Vincula um curso da plataforma, na última versão. Só o admin. */
    public function link(string $courseId, DateTimeImmutable $now): array
    {
        $this->requireAdmin();
        $version = $this->platform->latestCourseVersion($courseId) ?? throw new PublishRejected('NOT_FOUND');
        $created = $this->docs->link($courseId, $version, $now);
        return ['courseId' => $courseId, 'adoptedVersion' => $version, 'created' => $created];
    }

    /**
     * Copia um curso vinculado (como o aluno o vê, com a camada) para um curso da instituição, que ela passa a editar
     * por inteiro. A cópia não recebe mais as versões do curso-modelo, perde as travas e tem id próprio (progresso
     * próprio). Só o admin.
     */
    public function copy(string $courseId, string $slug, DateTimeImmutable $now): array
    {
        $this->requireAdmin();
        $source = CourseId::isPlatform($courseId) ? $this->course($courseId) : null;
        $newId = CourseId::forTenant($this->tenant->tenantSlug, $slug);
        if ($source === null) {
            throw new PublishRejected('NOT_FOUND');
        }
        if ($newId === null) {
            throw new PublishRejected('CONTENT_INVALID', [new Problem('SLUG_INVALID', '')]);
        }
        $doc = self::unlock(Json::decode($source['content']));
        $doc['courseId'] = $newId;
        $doc['copiedFrom'] = ['courseId' => $courseId, 'version' => $source['version']];
        return $this->publish('course', $slug, Json::encodeArray($doc), $now) + ['courseId' => $newId];
    }

    /**
     * Para cada curso vinculado com versão nova na plataforma: adota se a camada mescla sem problemas; senão segura a
     * versão atual e registra a pendência. Roda na release (ou num cron), não no pedido do aluno.
     *
     * @return list<array{courseId: string, adoptedVersion: int, pendingVersion: int|null}>
     */
    public function refreshLinks(): array
    {
        $out = [];
        foreach ($this->docs->links() as $link) {
            $out[] = $this->tryAdopt($link['courseId'], $link['adoptedVersion']);
        }
        return $out;
    }

    public static function etag(string $sha256): string
    {
        return '"' . substr($sha256, 0, 32) . '"';
    }

    // ------------------------------------------------------------------ apoio

    private function publishOverlay(string $courseId, mixed $overlay, string $content, DateTimeImmutable $now): array
    {
        $link = $this->findLink($courseId) ?? throw new PublishRejected('NOT_FOUND');
        // A camada tem de valer na versão que os alunos veem hoje...
        [, $problems, $merged] = $this->merge($courseId, $link['adoptedVersion'], $overlay);
        if ($problems !== [] || $merged !== []) {
            throw new PublishRejected('CONTENT_INVALID', $problems, $merged);
        }
        $r = $this->docs->publish('overlay', $courseId, $content, hash('sha256', $content), $now);
        // ...e, se ela já resolve a pendência, a versão nova é adotada na hora.
        $state = $this->tryAdopt($courseId, $link['adoptedVersion']);
        return ['kind' => 'overlay', 'slug' => $courseId, 'version' => $r['version'], 'created' => $r['created'], 'adoptedVersion' => $state['adoptedVersion']];
    }

    /** @return array{courseId: string, adoptedVersion: int, pendingVersion: int|null} */
    private function tryAdopt(string $courseId, int $adopted): array
    {
        $latest = (int) $this->platform->latestCourseVersion($courseId);
        if ($latest <= $adopted) {
            return ['courseId' => $courseId, 'adoptedVersion' => $adopted, 'pendingVersion' => null];
        }
        [, $problems, $merged] = $this->merge($courseId, $latest, $this->overlay($courseId)['doc']);
        if ($problems === [] && $merged === []) {
            $this->docs->adopt($courseId, $latest);
            return ['courseId' => $courseId, 'adoptedVersion' => $latest, 'pendingVersion' => null];
        }
        $this->docs->hold($courseId, $latest, array_map(static fn (Problem $p): string => $p->key(), array_merge($problems, $merged)));
        return ['courseId' => $courseId, 'adoptedVersion' => $adopted, 'pendingVersion' => $latest];
    }

    /**
     * O curso-modelo numa versão, mesclado com uma camada.
     *
     * @return array{array<string, mixed>|null, list<Problem>, list<Problem>} [curso, problemas da camada, do curso mesclado]
     */
    private function merge(string $courseId, int $version, mixed $overlay): array
    {
        $base = $this->platform->course($courseId, $version) ?? throw new \RuntimeException("{$courseId} v{$version} sumiu do catálogo");
        [$merged, $problems] = Overlay::apply(Json::decode($base['content']), $overlay);
        if ($merged === null) {
            return [null, $problems, []];
        }
        return [$merged, [], DocumentValidator::validate($merged)];
    }

    /** @return array{courseId: string, source: string, version: int, overlayVersion: int|null, content: string, sha256: string}|null */
    private function linked(string $courseId, int $version): ?array
    {
        $overlay = $this->overlay($courseId);
        [$merged, $problems, $mergedProblems] = $this->merge($courseId, $version, $overlay['doc']);
        if ($merged === null || $problems !== [] || $mergedProblems !== []) {
            return null; // não acontece: a camada e a adoção são validadas antes de gravar
        }
        $content = Json::encodeArray($merged);
        return ['courseId' => $courseId, 'source' => 'link', 'version' => $version, 'overlayVersion' => $overlay['version'], 'content' => $content, 'sha256' => hash('sha256', $content)];
    }

    /** @return array{doc: mixed, version: int|null} */
    private function overlay(string $courseId): array
    {
        $v = $this->docs->latest('overlay', $courseId);
        return $v === null ? ['doc' => Overlay::empty($courseId), 'version' => null] : ['doc' => Json::decode($v['content']), 'version' => $v['version']];
    }

    private function findLink(string $courseId): ?array
    {
        foreach ($this->docs->links() as $link) {
            if ($link['courseId'] === $courseId) {
                return $link;
            }
        }
        return null;
    }

    private function requireAdmin(): void
    {
        if (!$this->tenant->isAdmin()) {
            throw new PublishRejected('FORBIDDEN');
        }
    }

    /** Remove as travas da plataforma (a cópia é inteira da instituição). */
    private static function unlock(array $node): array
    {
        unset($node['locked']);
        foreach ($node as $k => $v) {
            if (is_array($v)) {
                $node[$k] = self::unlock($v);
            }
        }
        return $node;
    }

    private static function view(array $c): array
    {
        return ['courseId' => $c['courseId'], 'source' => $c['source'], 'version' => $c['version'], 'overlayVersion' => $c['overlayVersion'], 'etag' => self::etag($c['sha256']), 'content' => $c['content']];
    }

    private static function summary(array $c): array
    {
        $doc = Json::decode($c['content']);
        $title = [];
        foreach (DocumentValidator::LOCALES as $locale) {
            $title[$locale] = (string) ($doc['texts'][$locale][$doc['titleKey']] ?? $c['courseId']);
        }
        return [
            'courseId' => $c['courseId'],
            'source' => $c['source'],
            'version' => $c['version'],
            'overlayVersion' => $c['overlayVersion'],
            'phases' => count($doc['phases']),
            'etag' => self::etag($c['sha256']),
            'title' => $title,
        ];
    }
}
