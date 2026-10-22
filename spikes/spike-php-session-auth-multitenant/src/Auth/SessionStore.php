<?php
declare(strict_types=1);

namespace Spike\Auth\Auth;

/** A sessão vista pela aplicação. No HTTP é a sessão nativa do PHP; nos testes, um array. */
interface SessionStore
{
    public function get(string $key): mixed;

    public function set(string $key, mixed $value): void;

    /** Novo ID de sessão, mantendo os dados (contra fixação de sessão, ASVS 3.2.1). */
    public function regenerate(): void;

    /** Apaga os dados e invalida o ID no servidor (ASVS 3.3.1). */
    public function destroy(): void;
}
