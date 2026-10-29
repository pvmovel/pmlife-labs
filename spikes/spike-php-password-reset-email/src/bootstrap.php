<?php
declare(strict_types=1);

// Autoload do spike: Spike\Reset\<Pasta>\<Classe> ➔ src/<Pasta>/<Classe>.php. Sem Composer (hospedagem compartilhada).
spl_autoload_register(static function (string $class): void {
    $prefix = 'Spike\\Reset\\';
    if (str_starts_with($class, $prefix)) {
        $file = __DIR__ . '/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
        if (is_file($file)) {
            require $file;
        }
    }
});
