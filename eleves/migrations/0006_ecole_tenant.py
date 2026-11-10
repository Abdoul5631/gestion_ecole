from django.db import migrations, models
import django.db.models.deletion


def backfill(apps, schema_editor):
    Parametres = apps.get_model('parametres', 'Parametres')
    ecole, _ = Parametres.objects.get_or_create(
        pk=1,
        defaults={'nom_ecole': 'Complexe Scolaire Wend-Panga', 'ville': 'Bobo-Dioulasso'},
    )
    for name in ('Eleve', 'Presence'):
        Model = apps.get_model('eleves', name)
        Model.objects.filter(ecole__isnull=True).update(ecole=ecole)


class Migration(migrations.Migration):

    dependencies = [
        ('parametres', '0005_parametres_seuil_passage'),
        ('eleves', '0005_presence_presence_date_desc_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='eleve', name='ecole',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='eleves', to='parametres.parametres'),
        ),
        migrations.AddField(
            model_name='presence', name='ecole',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='presences', to='parametres.parametres'),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='eleve', name='matricule',
            field=models.CharField(max_length=20),
        ),
        migrations.AlterUniqueTogether(name='eleve', unique_together={('matricule', 'ecole')}),
    ]
