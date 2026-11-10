from django.db import migrations, models
import django.db.models.deletion


def backfill(apps, schema_editor):
    Parametres = apps.get_model('parametres', 'Parametres')
    ecole, _ = Parametres.objects.get_or_create(
        pk=1,
        defaults={'nom_ecole': 'Complexe Scolaire Wend-Panga', 'ville': 'Bobo-Dioulasso'},
    )
    for name in (
        'CalendrierComposition', 'ProgrammeComposition', 'Evaluation',
        'CalendrierExamenBlanc', 'ProgrammeExamenBlanc', 'Deliberation', 'Note',
    ):
        Model = apps.get_model('evaluations', name)
        Model.objects.filter(ecole__isnull=True).update(ecole=ecole)


class Migration(migrations.Migration):

    dependencies = [
        ('parametres', '0005_parametres_seuil_passage'),
        ('evaluations', '0006_evaluation_libelle_note_sur'),
    ]

    operations = [
        migrations.AddField(
            model_name='calendriercomposition', name='ecole',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='calendriers_compo', to='parametres.parametres'),
        ),
        migrations.AddField(
            model_name='programmecomposition', name='ecole',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='programmes_compo', to='parametres.parametres'),
        ),
        migrations.AddField(
            model_name='evaluation', name='ecole',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='evaluations', to='parametres.parametres'),
        ),
        migrations.AddField(
            model_name='calendrierexamenblanc', name='ecole',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='calendriers_examen_blanc', to='parametres.parametres'),
        ),
        migrations.AddField(
            model_name='programmeexamenblanc', name='ecole',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='programmes_examen_blanc', to='parametres.parametres'),
        ),
        migrations.AddField(
            model_name='deliberation', name='ecole',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='deliberations', to='parametres.parametres'),
        ),
        migrations.AddField(
            model_name='note', name='ecole',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='notes', to='parametres.parametres'),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
