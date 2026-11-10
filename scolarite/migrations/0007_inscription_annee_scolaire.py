# Generated manually — année scolaire sur Inscription + unicité (élève, année)

from datetime import date

from django.db import migrations, models
import django.db.models.deletion


def backfill_annee(apps, schema_editor):
    Inscription = apps.get_model('scolarite', 'Inscription')
    AnneeScolaire = apps.get_model('scolarite', 'AnneeScolaire')

    today = date.today()
    debut = today.year if today.month >= 9 else today.year - 1
    libelle = f"{debut}-{debut + 1}"

    annee = AnneeScolaire.objects.filter(is_active=True).order_by('-libelle').first()
    if annee is None:
        annee = AnneeScolaire.objects.order_by('-libelle').first()
    if annee is None:
        annee = AnneeScolaire.objects.create(libelle=libelle, is_active=True)
    elif annee.libelle != libelle:
        clash = AnneeScolaire.objects.filter(libelle=libelle).exclude(pk=annee.pk).first()
        if clash:
            clash.libelle = f"{clash.libelle}-old"
            clash.is_active = False
            clash.save()
        annee.libelle = libelle
        annee.is_active = True
        annee.save()

    AnneeScolaire.objects.exclude(pk=annee.pk).update(is_active=False)
    Inscription.objects.filter(annee_scolaire__isnull=True).update(annee_scolaire=annee)

    # Un élève ne peut avoir qu'une inscription par année : on garde la plus récente.
    vus = set()
    for ins in Inscription.objects.filter(annee_scolaire=annee).order_by('-id'):
        key = (ins.eleve_id, annee.pk)
        if key in vus:
            ins.delete()
        else:
            vus.add(key)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('scolarite', '0006_niveau_is_classe_examen'),
    ]

    operations = [
        migrations.AddField(
            model_name='inscription',
            name='annee_scolaire',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='inscriptions',
                to='scolarite.anneescolaire',
            ),
        ),
        migrations.RunPython(backfill_annee, noop),
        migrations.AlterUniqueTogether(
            name='inscription',
            unique_together={('eleve', 'annee_scolaire')},
        ),
    ]
