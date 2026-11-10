from django.db import migrations, models

from scolarite.ordre import rang_niveau


def calculer_rangs(apps, schema_editor):
    Niveau = apps.get_model('scolarite', 'Niveau')
    for n in Niveau.objects.all():
        Niveau.objects.filter(pk=n.pk).update(ordre=rang_niveau(n.nom))


class Migration(migrations.Migration):

    dependencies = [
        ('scolarite', '0012_piece_demande'),
    ]

    operations = [
        migrations.AddField(
            model_name='niveau',
            name='ordre',
            field=models.PositiveIntegerField(default=0, editable=False),
        ),
        migrations.AlterModelOptions(
            name='niveau',
            options={'ordering': ['ordre', 'nom']},
        ),
        migrations.AlterModelOptions(
            name='classe',
            options={'ordering': ['niveau__ordre', 'niveau__nom', 'nom']},
        ),
        migrations.RunPython(calculer_rangs, migrations.RunPython.noop),
    ]
