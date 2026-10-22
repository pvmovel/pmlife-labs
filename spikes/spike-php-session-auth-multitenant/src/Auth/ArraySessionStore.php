<?php
declare(strict_types=1);

namespace Spike\Auth\Auth;

/** Sessão em memória para os testes: o "ID" muda a cada regenerate, como na sessão nativa. */
final class ArraySessionStore implements SessionStore
{
    /** @var array<string, mixed> */
    private array $data = [];
    public string $id;

    public function __construct()
    {
        $this->id = bin2hex(random_bytes(8));
    }

    public function get(string $key): mixed
    {
        return $this->data[$key] ?? null;
    }

    public function set(string $key, mixed $value): void
    {
        $this->data[$key] = $value;
    }

    public function regenerate(): void
    {
        $this->id = bin2hex(random_bytes(8));
    }

    public function destroy(): void
    {
        $this->data = [];
        $this->id = bin2hex(random_bytes(8));
    }
}
