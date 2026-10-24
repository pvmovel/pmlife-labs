// Textos e dados dos componentes interativos, nos dois idiomas (projeto fictício: Horta Escolar).
// A matriz das camadas é a mesma que o ESLint aplica no produto (eslint-plugin-boundaries).
import type { ExplorerLabels } from '../components/FileExplorer';
import type { Layer, LayerLabels } from '../components/LayerDiagram';
import type { WalkLabels, WalkStep } from '../components/FeatureWalkthrough';

export type Lang = 'pt' | 'en';

const layerNames: Record<Lang, Record<string, string>> = {
  pt: { domain: 'Domain', application: 'Application', infrastructure: 'Infrastructure', presentation: 'Presentation', 'composition-root': 'Composition Root', content: 'Content', tests: 'Testes', backend: 'Backend', delivery: 'Entrega', docs: 'Docs' },
  en: { domain: 'Domain', application: 'Application', infrastructure: 'Infrastructure', presentation: 'Presentation', 'composition-root': 'Composition Root', content: 'Content', tests: 'Tests', backend: 'Backend', delivery: 'Delivery', docs: 'Docs' },
};

export const explorerLabels: Record<Lang, ExplorerLabels> = {
  pt: { filter: 'Filtrar por nome ou função', empty: 'Nenhum arquivo encontrado.', pick: 'Escolha um arquivo na árvore.', layer: 'Camada', exports: 'Expõe', usedBy: 'Usado por', origin: 'Criado em', conformity: 'Conformidade', ok: 'sem achados', finding: 'há achado na auditoria', ptOnly: 'descrição só em português', layers: layerNames.pt },
  en: { filter: 'Filter by name or purpose', empty: 'No file found.', pick: 'Pick a file in the tree.', layer: 'Layer', exports: 'Exports', usedBy: 'Used by', origin: 'Created in', conformity: 'Conformance', ok: 'no findings', finding: 'audit finding', ptOnly: 'description in Portuguese only', layers: layerNames.en },
};

const layerText: Record<Lang, Record<string, [string, string]>> = {
  pt: {
    domain: ['Regras de negócio em TypeScript puro: entidades, value objects e serviços, sem framework nem I/O.', 'src/Domain/Entities/Canteiro.ts'],
    application: ['Casos de uso, que orquestram o domínio, e Ports, as interfaces do que a aplicação precisa do mundo.', 'src/Application/UseCases/RegistrarColheitaUseCase.ts'],
    infrastructure: ['Adapters: as implementações concretas dos Ports (HTTP, banco, arquivos).', 'src/Infrastructure/Adapters/HttpCanteiroRepository.ts'],
    presentation: ['Telas React, hooks e textos; fala só com casos de uso.', 'src/Presentation/Components/PainelDaHorta.tsx'],
    'composition-root': ['O único lugar que instancia adapters e os entrega aos casos de uso.', 'src/Presentation/di/Dependencias.tsx'],
    content: ['Dados versionados com o código (culturas, textos). É lido, nunca importa nada.', 'src/Content/culturas.json'],
  },
  en: {
    domain: ['Business rules in plain TypeScript: entities, value objects and services, with no framework or I/O.', 'src/Domain/Entities/Canteiro.ts'],
    application: ['Use cases, which orchestrate the domain, and Ports, the interfaces of what the application needs from the world.', 'src/Application/UseCases/RegistrarColheitaUseCase.ts'],
    infrastructure: ['Adapters: the concrete implementations of the Ports (HTTP, database, files).', 'src/Infrastructure/Adapters/HttpCanteiroRepository.ts'],
    presentation: ['React screens, hooks and texts; it only talks to use cases.', 'src/Presentation/Components/PainelDaHorta.tsx'],
    'composition-root': ['The only place that instantiates adapters and hands them to the use cases.', 'src/Presentation/di/Dependencias.tsx'],
    content: ['Data versioned with the code (crops, texts). It is read and never imports anything.', 'src/Content/culturas.json'],
  },
};

/** Quem pode importar quem (a matriz do ESLint). */
const MATRIX: Record<string, readonly string[]> = {
  domain: ['domain'],
  application: ['application', 'domain'],
  infrastructure: ['infrastructure', 'application', 'domain', 'content'],
  presentation: ['presentation', 'composition-root', 'application', 'domain', 'content'],
  'composition-root': ['composition-root', 'infrastructure', 'application', 'domain'],
  content: ['content'],
};

export const layers = (lang: Lang): Layer[] =>
  Object.keys(MATRIX).map((id) => ({ id, name: layerNames[lang][id], contains: layerText[lang][id][0], example: layerText[lang][id][1], canImport: MATRIX[id] }));

export const layerLabels: Record<Lang, LayerLabels> = {
  pt: { hint: 'Clique numa camada para ver o que ela contém e o que pode importar.', contains: 'Contém', example: 'Exemplo', canImport: 'Pode importar', cannotImport: 'Não pode importar (o lint barra)', none: 'nenhuma' },
  en: { hint: 'Click a layer to see what it holds and what it may import.', contains: 'Holds', example: 'Example', canImport: 'May import', cannotImport: 'May not import (blocked by the linter)', none: 'none' },
};

const steps: Record<Lang, [string, string, string, string][]> = {
  pt: [
    ['presentation', 'src/Presentation/Components/PainelDaHorta.tsx', 'O clique', 'A professora clica em "Registrar colheita" no canteiro de alfaces. A tela não sabe calcular nada nem gravar nada: ela chama o caso de uso que recebeu do Composition Root.'],
    ['application', 'src/Application/UseCases/RegistrarColheitaUseCase.ts', 'O caso de uso', 'O caso de uso carrega o canteiro pelo Port, pede ao domínio que registre a colheita e grava o resultado. Ele não sabe se o canteiro está numa API, num banco ou na memória.'],
    ['domain', 'src/Domain/Entities/Canteiro.ts', 'A regra de negócio', 'O canteiro confere a regra: não se colhe o que não foi plantado, e o peso não pode ser negativo (value object Colheita). É TypeScript puro, testado sem tela e sem rede.'],
    ['infrastructure', 'src/Infrastructure/Adapters/HttpCanteiroRepository.ts', 'O adapter', 'O adapter do Port envia o canteiro atualizado para a API no formato do contrato e converte qualquer falha num erro com código estável.'],
    ['backend', 'backend/api/canteiros.php', 'O servidor', 'O endpoint valida o pedido, grava pelo repositório e responde no envelope do contrato. Trocar este backend por outro não muda nenhuma das camadas acima.'],
  ],
  en: [
    ['presentation', 'src/Presentation/Components/PainelDaHorta.tsx', 'The click', 'The teacher clicks "Record harvest" on the lettuce bed. The screen neither computes nor saves anything: it calls the use case it got from the Composition Root.'],
    ['application', 'src/Application/UseCases/RegistrarColheitaUseCase.ts', 'The use case', 'The use case loads the bed through the Port, asks the domain to record the harvest and saves the result. It does not know whether the bed lives in an API, a database or memory.'],
    ['domain', 'src/Domain/Entities/Canteiro.ts', 'The business rule', 'The bed checks the rule: nothing is harvested that was not planted, and the weight cannot be negative (the Colheita value object). Plain TypeScript, tested with no screen and no network.'],
    ['infrastructure', 'src/Infrastructure/Adapters/HttpCanteiroRepository.ts', 'The adapter', 'The Port adapter sends the updated bed to the API in the contract format and turns any failure into an error with a stable code.'],
    ['backend', 'backend/api/canteiros.php', 'The server', 'The endpoint validates the request, saves through the repository and answers in the contract envelope. Swapping this backend changes none of the layers above.'],
  ],
};

export const walkSteps = (lang: Lang): WalkStep[] =>
  steps[lang].map(([layer, file, title, text]) => ({ layer, layerName: layerNames[lang][layer], file, title, text }));

export const walkLabels: Record<Lang, WalkLabels> = {
  pt: { previous: 'Anterior', next: 'Próximo', step: 'Passo', of: 'de', file: 'Arquivo' },
  en: { previous: 'Previous', next: 'Next', step: 'Step', of: 'of', file: 'File' },
};
