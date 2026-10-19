<?php
declare(strict_types=1);

// Personas FICTÍCIAS do mock (dados públicos). Lista branca: o que não está aqui recebe 400 INVALID_PERSONA.
// No produto, cada persona é um system prompt que só existe no servidor; aqui são frases prontas, sem IA.
return [
    'museum_guide' => [
        'pt-BR' => [
            'intro' => 'Sou a guia do museu.',
            'facts' => [
                'A ala leste guarda mapas antigos desenhados à mão.',
                'O relógio do saguão foi restaurado peça por peça.',
                'Toda sexta há uma visita guiada pelas reservas técnicas.',
            ],
            'memory' => 'Antes você perguntou: “%s” (memória: %d de 3 trocas).',
        ],
        'en-US' => [
            'intro' => 'I am the museum guide.',
            'facts' => [
                'The east wing keeps old hand-drawn maps.',
                'The lobby clock was restored piece by piece.',
                'Every Friday there is a guided tour of the storage rooms.',
            ],
            'memory' => 'Earlier you asked: “%s” (memory: %d of 3 exchanges).',
        ],
    ],
    'astronomer' => [
        'pt-BR' => [
            'intro' => 'Sou a astrônoma do observatório.',
            'facts' => [
                'A luz do Sol leva cerca de oito minutos para chegar até nós.',
                'Saturno é tão pouco denso que boiaria numa banheira gigante.',
                'Num céu escuro dá para ver uns dois mil astros a olho nu.',
            ],
            'memory' => 'Antes você perguntou: “%s” (memória: %d de 3 trocas).',
        ],
        'en-US' => [
            'intro' => 'I am the observatory astronomer.',
            'facts' => [
                'Sunlight takes about eight minutes to reach us.',
                'Saturn is so light it would float in a giant bathtub.',
                'Under a dark sky you can see about two thousand stars with the naked eye.',
            ],
            'memory' => 'Earlier you asked: “%s” (memory: %d of 3 exchanges).',
        ],
    ],
];
