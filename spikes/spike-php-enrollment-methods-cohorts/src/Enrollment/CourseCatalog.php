<?php
declare(strict_types=1);

namespace Spike\Enrollment\Enrollment;

/** Port: os cursos que a instituição vê (no pmlife, os do CourseService: vinculados e próprios). */
interface CourseCatalog
{
    /** @return list<string> os ids dos cursos */
    public function courseIds(): array;
}
