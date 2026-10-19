<?php
declare(strict_types=1);

// Mock do diálogo com NPC (US22b), com o MESMO contrato do endpoint do produto, mas sem IA e sem custo:
//   POST { persona, message, history?: [{ question, answer }], lang? }
//   200 { status: "success", data: { answer } }
//   400 INVALID_PERSONA (persona fora da lista branca) · 400 INVALID_REQUEST · 405 METHOD_NOT_ALLOWED
//
// O histórico nunca é confiado ao cliente: itens fora do formato são descartados, cada fala tem limite de
// tamanho e só as 3 trocas mais recentes são usadas. A resposta cita a pergunta anterior: é a prova de que a
// memória curta chegou ao servidor.

const NPC_MAX_MESSAGE = 500;
const NPC_MAX_ANSWER = 2000;
const NPC_MAX_HISTORY = 3;
const NPC_MAX_BODY = 16384;

/** @return array{0:int,1:array<string,mixed>} [status HTTP, corpo] */
function npc_mock_handle(string $method, string $raw, array $personas): array
{
    if ($method !== 'POST') {
        return [405, npc_error('METHOD_NOT_ALLOWED')];
    }
    if (strlen($raw) > NPC_MAX_BODY) {
        return [400, npc_error('INVALID_REQUEST')];
    }
    $in = json_decode($raw, true);
    if (!is_array($in) || !is_string($in['message'] ?? null)) {
        return [400, npc_error('INVALID_REQUEST')];
    }
    $persona = $in['persona'] ?? null;
    if (!is_string($persona) || !array_key_exists($persona, $personas)) {
        return [400, npc_error('INVALID_PERSONA')];
    }
    $message = trim($in['message']);
    if ($message === '' || mb_strlen($message) > NPC_MAX_MESSAGE) {
        return [400, npc_error('INVALID_REQUEST')];
    }
    $lang = ($in['lang'] ?? '') === 'en-US' ? 'en-US' : 'pt-BR';
    $history = npc_sanitize_history($in['history'] ?? []);

    $p = $personas[$persona][$lang];
    $answer = $p['intro'] . ' ' . $p['facts'][crc32($message) % count($p['facts'])];
    if ($history !== []) {
        $last = $history[count($history) - 1]['question'];
        $answer .= ' ' . sprintf($p['memory'], npc_excerpt($last, 80), count($history));
    }
    return [200, ['status' => 'success', 'data' => ['answer' => $answer]]];
}

/**
 * Só trocas no formato { question, answer } com textos não vazios e dentro do limite; das válidas, as 3 últimas.
 * @return list<array{question:string,answer:string}>
 */
function npc_sanitize_history($history): array
{
    if (!is_array($history)) {
        return [];
    }
    $valid = [];
    foreach ($history as $turn) {
        if (!is_array($turn) || !is_string($turn['question'] ?? null) || !is_string($turn['answer'] ?? null)) {
            continue;
        }
        $q = trim($turn['question']);
        $a = trim($turn['answer']);
        if ($q === '' || $a === '' || mb_strlen($q) > NPC_MAX_MESSAGE || mb_strlen($a) > NPC_MAX_ANSWER) {
            continue;
        }
        $valid[] = ['question' => $q, 'answer' => $a];
    }
    return array_slice($valid, -NPC_MAX_HISTORY);
}

function npc_excerpt(string $text, int $max): string
{
    return mb_strlen($text) > $max ? rtrim(mb_substr($text, 0, $max - 1)) . '…' : $text;
}

function npc_error(string $code): array
{
    return ['status' => 'error', 'error' => ['code' => $code]];
}
