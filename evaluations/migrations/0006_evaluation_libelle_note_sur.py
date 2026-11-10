from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('evaluations', '0005_calendrier_programme_examen_blanc_deliberation'),
    ]

    operations = [
        migrations.AddField(
            model_name='evaluation',
            name='note_sur',
            field=models.PositiveSmallIntegerField(default=20),
        ),
        migrations.AddField(
            model_name='evaluation',
            name='libelle',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
    ]
