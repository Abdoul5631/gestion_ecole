from django.db import migrations
from django.utils.text import slugify


def donner_une_adresse(apps, schema_editor):
    """Chaque école a une adresse /ecole/<slug> : on complète celles qui n'en avaient pas."""
    Parametres = apps.get_model('parametres', 'Parametres')
    for ecole in Parametres.objects.filter(slug__isnull=True) | Parametres.objects.filter(slug=''):
        base = slugify(ecole.nom_ecole) or f'ecole-{ecole.pk}'
        candidat, n = base, 2
        while Parametres.objects.exclude(pk=ecole.pk).filter(slug=candidat).exists():
            candidat = f'{base}-{n}'
            n += 1
        Parametres.objects.filter(pk=ecole.pk).update(slug=candidat)


class Migration(migrations.Migration):

    dependencies = [
        ('parametres', '0015_prefixe_matricule'),
    ]

    operations = [
        migrations.RunPython(donner_une_adresse, migrations.RunPython.noop),
    ]
