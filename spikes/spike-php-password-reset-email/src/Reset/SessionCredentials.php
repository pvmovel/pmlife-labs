<?php
declare(strict_types=1);

namespace Spike\Reset\Reset;

/**
 * Encerra as sessões dos outros aparelhos sem listar arquivos de sessão: o login guarda na sessão a versão das
 * credenciais da conta, e a troca de senha sobe essa versão. Na próxima requisição, a sessão antiga não confere e cai.
 * (Na Etapa 2, a conferência fica no AuthService::current().)
 */
final class SessionCredentials
{
    public function __construct(private readonly ResetStore $store)
    {
    }

    /** @param array{uid?: int, cv?: int} $session */
    public function stillValid(array $session): bool
    {
        if (!isset($session['uid'], $session['cv'])) {
            return false;
        }
        return $this->store->credentialsVersion($session['uid']) === $session['cv'];
    }
}
