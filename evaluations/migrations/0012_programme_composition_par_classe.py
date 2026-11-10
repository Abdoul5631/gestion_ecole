from django.db import migrations, models
import django.db.models.deletion


def repartir_par_classe(apps, schema_editor):
    """Les anciennes lignes valaient pour tout le niveau : on en fait une ligne par classe qui enseigne la matière."""
    Programme = apps.get_model('evaluations', 'ProgrammeComposition')
    Classe = apps.get_model('scolarite', 'Classe')
    ClasseMatiere = apps.get_model('cours', 'ClasseMatiere')
    for p in Programme.objects.filter(classe__isnull=True).select_related('calendrier'):
        classes = Classe.objects.filter(niveau_id=p.calendrier.niveau_id)
        crees = 0
        for c in classes:
            if not ClasseMatiere.objects.filter(classe=c, matiere_id=p.matiere_id).exists():
                continue
            Programme.objects.get_or_create(
                calendrier_id=p.calendrier_id, classe=c, matiere_id=p.matiere_id,
                defaults={'contenu': p.contenu, 'date_composition': p.date_composition, 'heure_debut': p.heure_debut,
                          'heure_fin': p.heure_fin, 'ecole_id': p.ecole_id},
            )
            crees += 1
        if crees:
            p.delete()  # remplacée par ses lignes par classe ; sans classe correspondante, elle est conservée


class Migration(migrations.Migration):

    dependencies = [
        ('evaluations', '0011_publication_calendriers'),
        ('scolarite', '0001_initial'),
        ('cours', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='programmecomposition',
            name='classe',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='programmes_compo', to='scolarite.classe'),
        ),
        migrations.AlterUniqueTogether(
            name='programmecomposition',
            unique_together={('calendrier', 'classe', 'matiere')},
        ),
        migrations.RunPython(repartir_par_classe, migrations.RunPython.noop),
    ]
