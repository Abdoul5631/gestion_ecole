from django.db import migrations, models
import django.db.models.deletion


def backfill(apps, schema_editor):
    Parametres = apps.get_model('parametres', 'Parametres')
    ecole, _ = Parametres.objects.get_or_create(
        pk=1,
        defaults={'nom_ecole': 'Complexe Scolaire Wend-Panga', 'ville': 'Bobo-Dioulasso'},
    )
    for name in ('Niveau', 'Classe', 'AnneeScolaire', 'Trimestre', 'Inscription',
                 'ResultatExamenNational', 'PassageAnnee'):
        Model = apps.get_model('scolarite', name)
        Model.objects.filter(ecole__isnull=True).update(ecole=ecole)


class Migration(migrations.Migration):

    dependencies = [
        ('parametres', '0005_parametres_seuil_passage'),
        ('scolarite', '0008_passage_examen_redoublant'),
    ]

    operations = [
        migrations.AddField(
            model_name='niveau', name='ecole',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='niveaux', to='parametres.parametres'),
        ),
        migrations.AddField(
            model_name='classe', name='ecole',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='classes', to='parametres.parametres'),
        ),
        migrations.AddField(
            model_name='anneescolaire', name='ecole',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='annees', to='parametres.parametres'),
        ),
        migrations.AddField(
            model_name='trimestre', name='ecole',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='trimestres', to='parametres.parametres'),
        ),
        migrations.AddField(
            model_name='inscription', name='ecole',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='inscriptions', to='parametres.parametres'),
        ),
        migrations.AddField(
            model_name='resultatexamennational', name='ecole',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='resultats_examen', to='parametres.parametres'),
        ),
        migrations.AddField(
            model_name='passageannee', name='ecole',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='passages', to='parametres.parametres'),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='niveau', name='nom',
            field=models.CharField(max_length=50),
        ),
        migrations.AlterUniqueTogether(name='niveau', unique_together={('nom', 'ecole')}),
        migrations.AlterField(
            model_name='anneescolaire', name='libelle',
            field=models.CharField(max_length=20),
        ),
        migrations.AlterUniqueTogether(name='anneescolaire', unique_together={('libelle', 'ecole')}),
    ]
