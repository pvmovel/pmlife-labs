<?php
declare(strict_types=1);

namespace Spike\Files\Storage;

/**
 * Porta do armazenamento (ADR-006): hoje o disco da hospedagem, fora do webroot; na escala, um S3/R2 com a mesma
 * interface. Ninguém de fora passa caminho: o tenant é um inteiro e a chave é gerada aqui.
 */
interface FileStorage
{
    /**
     * Grava o conteúdo e devolve a chave gerada. Lê no máximo $maxBytes + 1 bytes: se passar, apaga e recusa
     * (FILE_TOO_LARGE), mesmo que o tamanho declarado tenha mentido.
     *
     * @param resource $source
     */
    public function put(int $tenantId, $source, int $maxBytes): string;

    /** @return resource|null o arquivo aberto para leitura, ou null se a chave não existe (ou não é uma chave) */
    public function open(int $tenantId, string $key);

    public function delete(int $tenantId, string $key): void;
}
