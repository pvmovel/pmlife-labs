<?php
declare(strict_types=1);

namespace Spike\Admin\Admin;

/**
 * O formulário "Nova instituição", com os mesmos códigos da PoC (InstitutionForm.ts): a tela valida para ajudar, e o
 * servidor valida de novo, porque é ele que decide. O SLUG_TAKEN vem do banco (PlatformService).
 */
final class InstitutionRules
{
    public const SLUG = '/^[a-z][a-z0-9-]{1,19}$/';
    public const NAME_MAX = 80;

    /** @return array<string, string> campo => código (vazio = válido) */
    public static function validate(string $name, string $slug, string $masterEmail): array
    {
        $errors = [];
        $name = trim($name);
        $slug = trim($slug);
        $masterEmail = trim($masterEmail);
        if ($name === '') {
            $errors['name'] = 'REQUIRED';
        } elseif (mb_strlen($name) > self::NAME_MAX) {
            $errors['name'] = 'NAME_TOO_LONG';
        }
        if ($slug === '') {
            $errors['slug'] = 'REQUIRED';
        } elseif (preg_match(self::SLUG, $slug) !== 1) {
            $errors['slug'] = 'SLUG_FORMAT';
        }
        if ($masterEmail === '') {
            $errors['masterEmail'] = 'REQUIRED';
        } elseif (strlen($masterEmail) > 254 || filter_var($masterEmail, FILTER_VALIDATE_EMAIL) === false) {
            $errors['masterEmail'] = 'EMAIL_FORMAT';
        }
        return $errors;
    }
}
