<?php
declare(strict_types=1);

/**
 * Localiza a configuração do banco FORA do webroot, com a mesma técnica do spike
 * spike-php-env-security-hostgator: procura `labs.<env>.env.php` em $HOME e nos
 * diretórios acima do DOCUMENT_ROOT, sem caminho absoluto fixo.
 */
final class LabsConfig
{
    private const MAX_LEVELS = 4;

    /** @return array<string, mixed> */
    public static function load(): array
    {
        $host = strtolower(preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? '') ?? '');
        $env = in_array($host, ['', 'localhost', '127.0.0.1'], true) ? 'development' : 'production';
        $file = "labs.{$env}.env.php";

        foreach (self::candidateDirs() as $dir) {
            $path = "{$dir}/{$file}";
            if (is_file($path) && is_readable($path)) {
                $config = require $path;
                if (!is_array($config)) {
                    throw new RuntimeException('ENV_MALFORMED');
                }
                return $config;
            }
        }
        throw new RuntimeException('ENV_NOT_FOUND');
    }

    /** @return string[] */
    private static function candidateDirs(): array
    {
        $dirs = [];
        $home = getenv('HOME');
        if (is_string($home) && $home !== '') {
            $dirs[] = rtrim($home, '/');
        }
        $dir = dirname($_SERVER['DOCUMENT_ROOT'] ?? '');
        for ($i = 0; $i < self::MAX_LEVELS && $dir !== '' && $dir !== '.'; $i++) {
            $dirs[] = rtrim($dir, '/');
            $parent = dirname($dir);
            if ($parent === $dir) {
                break;
            }
            $dir = $parent;
        }
        return array_values(array_unique($dirs));
    }
}
