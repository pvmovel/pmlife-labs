<?php
declare(strict_types=1);

namespace Spike\Ai;

/** Tenta os provedores em ordem (ex.: Gemini ➔ Groq). Só falha se todos falharem. */
final class FailoverProvider implements AiProvider
{
    /** @var list<string> erros da última chamada, para o log do servidor */
    public array $lastErrors = [];

    /** @param list<AiProvider> $providers */
    public function __construct(private array $providers)
    {
    }

    public function name(): string
    {
        return 'failover';
    }

    /** Nome de quem respondeu na última chamada. */
    public ?string $lastProvider = null;

    public function complete(string $system, string $user, int $maxTokens): string
    {
        $this->lastErrors = [];
        foreach ($this->providers as $provider) {
            try {
                $text = $provider->complete($system, $user, $maxTokens);
                $this->lastProvider = $provider->name();
                return $text;
            } catch (AiUnavailable $e) {
                $this->lastErrors[] = $e->getMessage();
            }
        }
        throw new AiUnavailable(implode(' | ', $this->lastErrors));
    }
}
