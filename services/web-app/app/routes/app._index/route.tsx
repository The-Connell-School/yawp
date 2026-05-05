        prisma.studentCourse.findMany({
          where: {
            allowedInClasses: {
              some: {
                class: {
                  teachers: { some: { id: profile.teacherProfile.id } },
                  isArchived: false,
                },
              },
            },
          },
          select: { id: true, title: true, image: { select: { id: true } } },
          orderBy: { position: 'asc' },
        }),