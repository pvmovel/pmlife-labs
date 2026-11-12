<?php
declare(strict_types=1);

namespace Spike\Badges;

/**
 * O certificado no padrão Open Badges 2.0, verificação "hosted": três JSON-LD públicos, ligados por URL. A plataforma é
 * quem hospeda, e quem verifica busca o endereço e confere que ele responde. Sem assinatura nem chave na hospedagem
 * (decisão do Pablo, 2026-11-11).
 * - Assertion: o certificado de uma pessoa (quem recebeu vai só como hash do e-mail com sal);
 * - BadgeClass: o curso concluído (nome, descrição, imagem e critério);
 * - Profile: a instituição que emite.
 */
final class OpenBadges
{
    public const CONTEXT = 'https://w3id.org/openbadges/v2';

    /** @param array<string, mixed> $c a linha do certificado */
    public static function assertion(array $c, string $base): array
    {
        return [
            '@context' => self::CONTEXT,
            'type' => 'Assertion',
            'id' => "{$base}/ob.php?type=assertion&code={$c['code']}",
            'recipient' => ['type' => 'email', 'hashed' => true, 'salt' => (string) $c['salt'], 'identity' => 'sha256$' . $c['identity_hash']],
            'badge' => self::badgeUrl($base, (int) $c['tenant_id'], (string) $c['course_id']),
            'verification' => ['type' => 'hosted'],
            'issuedOn' => str_replace(' ', 'T', (string) $c['issued_at']) . 'Z',
            'evidence' => "{$base}/verify.php?code={$c['code']}",
        ];
    }

    public static function badgeClass(int $tenantId, string $courseId, string $courseTitle, string $base): array
    {
        return [
            '@context' => self::CONTEXT,
            'type' => 'BadgeClass',
            'id' => self::badgeUrl($base, $tenantId, $courseId),
            'name' => "Certificado: {$courseTitle}",
            'description' => "Concluiu todas as fases do curso {$courseTitle}.",
            'image' => "{$base}/certificate.v1.svg",
            'criteria' => ['narrative' => 'Concluir todas as fases do curso.'],
            'issuer' => self::issuerUrl($base, $tenantId),
        ];
    }

    public static function issuer(int $tenantId, string $name, string $base): array
    {
        return ['@context' => self::CONTEXT, 'type' => 'Profile', 'id' => self::issuerUrl($base, $tenantId), 'name' => $name, 'url' => "{$base}/"];
    }

    public static function badgeUrl(string $base, int $tenantId, string $courseId): string
    {
        return "{$base}/ob.php?type=badge&tenant={$tenantId}&course=" . rawurlencode($courseId);
    }

    public static function issuerUrl(string $base, int $tenantId): string
    {
        return "{$base}/ob.php?type=issuer&tenant={$tenantId}";
    }
}
