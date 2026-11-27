<?php
declare(strict_types=1);

// Gera as amostras fictícias da demo (samples/), sem ferramenta externa: um PDF de 2 páginas e um PNG em degradê.
// O resultado vai para o repositório; rodar de novo dá os mesmos bytes (nada aleatório).
$dir = dirname(__DIR__) . '/samples';

function pdf(array $pages): string
{
    $objects = ['<< /Type /Catalog /Pages 2 0 R >>', ''];
    $kids = [];
    $font = 3;
    $objects[] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    foreach ($pages as $lines) {
        $text = "BT /F1 14 Tf 60 780 Td 20 TL\n";
        foreach ($lines as $line) {
            $text .= '(' . addcslashes($line, '()\\') . ") Tj T*\n";
        }
        $text .= "ET\n";
        $objects[] = '<< /Length ' . strlen($text) . " >>\nstream\n{$text}endstream";
        $content = count($objects);
        $objects[] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 {$font} 0 R >> >> /Contents {$content} 0 R >>";
        $kids[] = count($objects) . ' 0 R';
    }
    $objects[1] = '<< /Type /Pages /Kids [' . implode(' ', $kids) . '] /Count ' . count($kids) . ' >>';
    $out = "%PDF-1.4\n";
    $offsets = [];
    foreach ($objects as $i => $body) {
        $offsets[] = strlen($out);
        $out .= ($i + 1) . " 0 obj\n{$body}\nendobj\n";
    }
    $xref = strlen($out);
    $out .= 'xref' . "\n0 " . (count($objects) + 1) . "\n0000000000 65535 f \n";
    foreach ($offsets as $o) {
        $out .= sprintf("%010d 00000 n \n", $o);
    }
    return $out . "trailer\n<< /Size " . (count($objects) + 1) . " /Root 1 0 R >>\nstartxref\n{$xref}\n%%EOF\n";
}

function png(int $w, int $h): string
{
    $raw = '';
    for ($y = 0; $y < $h; $y++) {
        $raw .= "\0";
        for ($x = 0; $x < $w; $x++) {
            $raw .= chr(30 + intdiv(180 * $x, $w)) . chr(90 + intdiv(120 * $y, $h)) . chr(200);
        }
    }
    $chunk = static fn (string $type, string $data): string
        => pack('N', strlen($data)) . $type . $data . pack('N', crc32($type . $data));
    return "\x89PNG\r\n\x1A\n" . $chunk('IHDR', pack('NNCCCCC', $w, $h, 8, 2, 0, 0, 0))
        . $chunk('IDAT', (string) gzcompress($raw, 9)) . $chunk('IEND', '');
}

$lines = static fn (int $page): array => array_merge(
    ["Material de exemplo - pagina {$page} de 2", '', 'Arquivo ficticio da demo do spike de arquivos da instituicao.'],
    array_map(static fn (int $i): string => "Linha {$i}: o PHP entrega este PDF de uma pasta que o navegador nao acessa.", range(1, 30)),
);
file_put_contents("{$dir}/exemplo.pdf", pdf([$lines(1), $lines(2)]));
file_put_contents("{$dir}/exemplo.png", png(320, 120));
echo "samples/exemplo.pdf (" . filesize("{$dir}/exemplo.pdf") . " bytes) e samples/exemplo.png (" . filesize("{$dir}/exemplo.png") . " bytes)\n";
