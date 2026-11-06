<?php
declare(strict_types=1);

// O spike sem Composer (hospedagem compartilhada): carrega as classes direto.
require_once __DIR__ . '/Db/ConnectionFactory.php';
require_once __DIR__ . '/Db/Migrator.php';
require_once __DIR__ . '/CohortCapacity.php';
require_once __DIR__ . '/CohortEnrollment.php';
