from django.db import migrations, models
import django.db.models.deletion


def backfill(apps, schema_editor):
    Parametres = apps.get_model('parametres', 'Parametres')
    ecole, _ = Parametres.objects.get_or_create(
        pk=1,
        defaults={'nom_ecole': 'Complexe Scolaire Wend-Panga', 'ville': 'Bobo-Dioulasso'},
    )
    for name in ('Enseignant', 'Matiere', 'ClasseMatiere', 'EmploiDuTemps'):
        Model = apps.get_model('cours', name)
        Model.objects.filter(ecole__isnull=True).update(ecole=ecole)


class Migration(migrations.Migration):

    dependencies = [
        ('parametres', '0005_parametres_seuil_passage'),
        ('cours', '0009_enseignant_prenom_enseignant_signature'),
    ]

    operations = [
        migrations.AddField(
            model_name='enseignant', name='ecole',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='enseignants', to='parametres.parametres'),
        ),
        migrations.AddField(
            model_name='matiere', name='ecole',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='matieres', to='parametres.parametres'),
        ),
        migrations.AddField(
            model_name='classematiere', name='ecole',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='classe_matieres', to='parametres.parametres'),
        ),
        migrations.AddField(
            model_name='emploidutemps', name='ecole',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='emplois_du_temps', to='parametres.parametres'),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='matiere', name='nom',
            field=models.CharField(max_length=100),
        ),
        migrations.AlterUniqueTogether(name='matiere', unique_together={('nom', 'ecole')}),
    ]
