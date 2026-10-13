<?php
declare(strict_types=1);

/** Contrato (Port) de leitura das notas. Quem usa não sabe qual banco está por trás. */
interface NoteRepository
{
    /** @return array<int, array{id: int, title: string}> */
    public function findAll(): array;
}
