<?php
declare(strict_types=1);

namespace Spike\Admin\Platform;

use DateTimeImmutable;
use Spike\Admin\Access\AdminActor;
use Spike\Admin\Access\AdminPolicy;
use Spike\Admin\Admin\AdminRejected;
use Spike\Admin\Admin\InstitutionRules;
use Spike\Admin\Tenant\TenantScope;

/**
 * O que só o master da plataforma faz: as instituições (criar com o master, desativar, reativar), os outros masters
 * da plataforma e a escolha da instituição em que vai agir. Toda escrita grava a auditoria.
 */
final class PlatformService
{
    public const PAGE_SIZE = 20;

    public function __construct(private readonly PlatformRepository $repo, private readonly AdminActor $actor)
    {
    }

    /** @return array{items: list<array<string, mixed>>, total: int, page: int, pageSize: int} */
    public function institutions(string $search, int $page): array
    {
        $this->allow('institutions.manage');
        $page = max(1, $page);
        $result = $this->repo->institutions($search, $page, self::PAGE_SIZE);
        $last = max(1, (int) ceil($result['total'] / self::PAGE_SIZE));
        if ($page > $last) { // página além da última (a lista encolheu): devolve a última, como a tabela da PoC
            $page = $last;
            $result = $this->repo->institutions($search, $page, self::PAGE_SIZE);
        }
        return $result + ['page' => $page, 'pageSize' => self::PAGE_SIZE];
    }

    /** @return array{slug: string, master: 'created'|'existing'} */
    public function createInstitution(string $name, string $slug, string $masterEmail, DateTimeImmutable $now): array
    {
        $this->allow('institutions.manage');
        $errors = InstitutionRules::validate($name, $slug, $masterEmail);
        if ($errors !== []) {
            throw new AdminRejected(422, 'INVALID_INSTITUTION', $errors);
        }
        [$name, $slug, $email] = [trim($name), trim($slug), mb_strtolower(trim($masterEmail))];
        if ($this->repo->tenantBySlug($slug) !== null) {
            throw new AdminRejected(409, 'SLUG_TAKEN', ['slug' => 'SLUG_TAKEN']);
        }
        $at = $now->format('Y-m-d H:i:s');
        $created = $this->repo->createInstitution($name, $slug, $email, $at);
        $this->repo->audit($this->actor->userId, $created['tenantId'], 'institution.created', $name, $at);
        $this->repo->audit($this->actor->userId, $created['tenantId'], 'admin.granted', $created['masterName'], $at);
        return ['slug' => $slug, 'master' => $created['master']];
    }

    public function setInstitutionActive(string $slug, bool $active, DateTimeImmutable $now): void
    {
        $this->allow('institutions.manage');
        $tenant = $this->repo->tenantBySlug($slug) ?? throw new AdminRejected(404, 'TENANT_NOT_FOUND');
        if ($tenant['active'] === $active) {
            return;
        }
        $this->repo->setTenantActive($tenant['id'], $active);
        $this->repo->audit($this->actor->userId, $tenant['id'], $active ? 'institution.reactivated' : 'institution.deactivated', $tenant['name'], $now->format('Y-m-d H:i:s'));
    }

    /** Outro master da plataforma, a partir de uma conta que já existe. */
    public function addPlatformAdmin(string $email, DateTimeImmutable $now): void
    {
        $this->allow('platform.admins');
        $user = $this->repo->userByEmail(mb_strtolower(trim($email))) ?? throw new AdminRejected(404, 'ACCOUNT_NOT_FOUND');
        $at = $now->format('Y-m-d H:i:s');
        if ($this->repo->addPlatformAdmin($user['id'], $this->actor->userId, $at)) {
            $this->repo->audit($this->actor->userId, null, 'platform_admin.added', "user:{$user['id']}", $at);
        }
    }

    /** A instituição em que o master da plataforma vai agir (as pessoas, os cursos, a auditoria dela). */
    public function scope(string $slug): TenantScope
    {
        $this->allow('institutions.manage');
        $tenant = $this->repo->tenantBySlug($slug) ?? throw new AdminRejected(404, 'TENANT_NOT_FOUND');
        return new TenantScope($tenant['id'], $tenant['slug']);
    }

    private function allow(string $action): void
    {
        if (!AdminPolicy::can($this->actor, $action)) {
            throw new AdminRejected(403, 'FORBIDDEN');
        }
    }
}
