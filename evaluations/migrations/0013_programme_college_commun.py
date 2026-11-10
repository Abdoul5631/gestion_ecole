from django.db import migrations

NIVEAUX_PAR_CLASSE = {'2nde', '1ère', 'Terminale'}


def _normaliser(nom):
    cle = (nom or '').strip().lower().replace('è', 'e').replace('é', 'e').replace('ê', 'e').replace(' ', '')
    return {'2nde': '2nde', 'seconde': '2nde', '1ere': '1ère', 'premiere': '1ère', '1re': '1ère',
            'terminale': 'Terminale', 'tle': 'Terminale'}.get(cle, cle)


def regrouper_college(apps, schema_editor):
    """Au collège (6ème à 3ème) le programme est le même pour toutes les classes : une seule ligne par matière."""
    Programme = apps.get_model('evaluations', 'ProgrammeComposition')
    for p in Programme.objects.filter(classe__isnull=False).select_related('calendrier__niveau').order_by('id'):
        if _normaliser(p.calendrier.niveau.nom) in NIVEAUX_PAR_CLASSE:
            continue
        commun, cree = Programme.objects.get_or_create(
            calendrier_id=p.calendrier_id, classe=None, matiere_id=p.matiere_id,
            defaults={'contenu': p.contenu, 'date_composition': p.date_composition, 'heure_debut': p.heure_debut,
                      'heure_fin': p.heure_fin, 'ecole_id': p.ecole_id},
        )
        if not cree and not commun.date_composition and p.date_composition:
            commun.date_composition, commun.heure_debut, commun.heure_fin = p.date_composition, p.heure_debut, p.heure_fin
            commun.save()
        p.delete()


class Migration(migrations.Migration):

    dependencies = [
        ('evaluations', '0012_programme_composition_par_classe'),
    ]

    operations = [
        migrations.RunPython(regrouper_college, migrations.RunPython.noop),
    ]
