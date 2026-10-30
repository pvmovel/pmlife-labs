<?php
declare(strict_types=1);

namespace Spike\Courses\Http;

use DateTimeImmutable;
use JsonException;
use Spike\Courses\Content\Json;
use Spike\Courses\Content\Problem;
use Spike\Courses\Courses\CourseService;
use Spike\Courses\Courses\PublishRejected;
use Spike\Courses\Tenant\TenantContext;

/**
 * Os endpoints da sede e dos cursos, no envelope do contrato do PMLife ({status, data} ou {status, error: {code}}).
 *
 * - GET  headquarters       ➔ 200 com a sede e o ETag; 304 com If-None-Match igual.
 * - GET  courses            ➔ 200 com os cursos visíveis à instituição.
 * - GET  course?courseId=   ➔ 200 com o curso (cidade e fases) e o ETag; 304; 404 COURSE_NOT_FOUND.
 * - POST publish            ➔ {kind, slug, content}: 201 versão nova; 200 conteúdo igual ao da última versão;
 *                             422 CONTENT_INVALID com os problemas; 403 FORBIDDEN; 404; 413 CONTENT_TOO_LARGE.
 * - POST link               ➔ {courseId}: vincula um curso da plataforma (201, ou 200 se já estava).
 * - POST copy               ➔ {courseId, slug}: copia um curso vinculado para um curso da instituição (201).
 *
 * Devolve [status, corpo (texto JSON ou ''), cabeçalhos]. O documento entra no corpo como está gravado, sem
 * decodificar e codificar de novo.
 */
final class CoursesApi
{
    private const MAX_BODY = Json::MAX_BYTES + 4096;
    private const ROUTES = ['headquarters' => 'GET', 'courses' => 'GET', 'course' => 'GET', 'publish' => 'POST', 'link' => 'POST', 'copy' => 'POST'];

    /** @param callable(TenantContext): CourseService $service */
    public function __construct(private readonly mixed $service)
    {
    }

    /**
     * @param array<string, string> $query
     * @param array<string, string> $headers nomes em minúsculas
     * @return array{int, string, array<string, string>}
     */
    public function handle(string $method, string $route, array $query, string $body, ?TenantContext $tenant, array $headers, DateTimeImmutable $now): array
    {
        if (!isset(self::ROUTES[$route])) {
            return self::error(404, 'NOT_FOUND');
        }
        if ($method !== self::ROUTES[$route]) {
            return self::error(405, 'METHOD_NOT_ALLOWED');
        }
        if ($tenant === null) {
            return self::error(401, 'UNAUTHENTICATED');
        }
        $service = ($this->service)($tenant);

        if ($route === 'courses') {
            return self::ok(200, ['courses' => $service->courses()]);
        }
        if ($route === 'headquarters') {
            $doc = $service->headquarters();
            return self::document($doc, ['source' => $doc['source'], 'version' => $doc['version']], $headers);
        }
        if ($route === 'course') {
            $doc = $service->course((string) ($query['courseId'] ?? ''));
            if ($doc === null) {
                return self::error(404, 'COURSE_NOT_FOUND');
            }
            return self::document($doc, ['courseId' => $doc['courseId'], 'source' => $doc['source'], 'version' => $doc['version'], 'overlayVersion' => $doc['overlayVersion']], $headers);
        }

        if (strlen($body) > self::MAX_BODY) {
            return self::error(413, 'CONTENT_TOO_LARGE');
        }
        try {
            $input = json_decode($body, false, 64, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return self::error(400, 'INVALID_REQUEST');
        }
        if (!is_object($input)) {
            return self::error(400, 'INVALID_REQUEST');
        }
        try {
            if ($route === 'publish') {
                if (!is_string($input->kind ?? null) || !is_string($input->slug ?? null) || !property_exists($input, 'content')) {
                    return self::error(400, 'INVALID_REQUEST');
                }
                $result = $service->publish($input->kind, $input->slug, Json::canonicalValue($input->content), $now);
            } elseif ($route === 'link') {
                if (!is_string($input->courseId ?? null)) {
                    return self::error(400, 'INVALID_REQUEST');
                }
                $result = $service->link($input->courseId, $now);
            } else {
                if (!is_string($input->courseId ?? null) || !is_string($input->slug ?? null)) {
                    return self::error(400, 'INVALID_REQUEST');
                }
                $result = $service->copy($input->courseId, $input->slug, $now);
            }
        } catch (PublishRejected $e) {
            $status = ['FORBIDDEN' => 403, 'NOT_FOUND' => 404, 'CONTENT_TOO_LARGE' => 413][$e->reason] ?? 422;
            $error = ['code' => $e->reason];
            if ($e->problems !== []) {
                $error['problems'] = array_map(static fn (Problem $p): array => $p->toArray(), $e->problems);
            }
            if ($e->mergedProblems !== []) {
                $error['mergedProblems'] = array_map(static fn (Problem $p): array => $p->toArray(), $e->mergedProblems);
            }
            return [$status, json_encode(['status' => 'error', 'error' => $error], JSON_UNESCAPED_SLASHES), []];
        }
        return self::ok($result['created'] ? 201 : 200, $result);
    }

    /**
     * @param array{etag: string, content: string} $doc
     * @param array<string, mixed> $meta
     * @return array{int, string, array<string, string>}
     */
    private static function document(array $doc, array $meta, array $headers): array
    {
        // no-cache: o navegador guarda, mas pergunta sempre; com o ETag igual, a resposta é um 304 sem corpo.
        $cache = ['ETag' => $doc['etag'], 'Cache-Control' => 'private, no-cache'];
        if (($headers['if-none-match'] ?? '') === $doc['etag']) {
            return [304, '', $cache];
        }
        $json = json_encode($meta, JSON_UNESCAPED_SLASHES);
        return [200, '{"status":"success","data":' . substr($json, 0, -1) . ',"content":' . $doc['content'] . '}}', $cache];
    }

    /** @return array{int, string, array<string, string>} */
    private static function ok(int $status, array $data): array
    {
        return [$status, json_encode(['status' => 'success', 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), []];
    }

    /** @return array{int, string, array<string, string>} */
    private static function error(int $status, string $code): array
    {
        return [$status, json_encode(['status' => 'error', 'error' => ['code' => $code]]), []];
    }
}
