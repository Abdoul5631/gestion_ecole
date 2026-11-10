"""
Initialise les donnees de base : niveaux, annee scolaire, trimestres.
Usage : python manage.py setup_ecole
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Cree les niveaux, une annee scolaire et les trimestres"

    def handle(self, *args, **options):
        from parametres.models import Parametres
        from scolarite.models import Niveau, AnneeScolaire, Trimestre

        ecole = Parametres.get()
        self.stdout.write("=== Initialisation Gestion Ecole ===")
        self.stdout.write(f"École : {ecole.nom_ecole}")

        # 1. NIVEAUX
        niveaux = ['6eme', '5eme', '4eme', '3eme', '2nde', '1ere A', 'Terminale A']
        nb_n = 0
        for nom in niveaux:
            obj, created = Niveau.objects.get_or_create(nom=nom, ecole=ecole)
            if created:
                nb_n += 1
                self.stdout.write(f"  Niveau cree : {nom}")
            else:
                self.stdout.write(f"  Niveau existant : {nom}")
        self.stdout.write(f"Niveaux : {nb_n} cree(s)")

        # 2. ANNEE SCOLAIRE
        from scolarite.utils import annee_scolaire_courante
        libelle, _ = annee_scolaire_courante()
        annee, created = AnneeScolaire.objects.get_or_create(
            libelle=libelle, ecole=ecole, defaults={'is_active': True}
        )
        annee.is_active = True
        annee.ecole = ecole
        annee.save()
        AnneeScolaire.objects.filter(ecole=ecole).exclude(pk=annee.pk).update(is_active=False)
        if created:
            self.stdout.write(f"Annee scolaire creee : {libelle}")
        else:
            self.stdout.write(f"Annee scolaire existante : {libelle}")

        # 3. TRIMESTRES
        trimestres = ['Trimestre 1', 'Trimestre 2', 'Trimestre 3']
        nb_t = 0
        for nom in trimestres:
            obj, created = Trimestre.objects.get_or_create(
                nom=nom, annee_scolaire=annee, defaults={'ecole': ecole}
            )
            if created:
                nb_t += 1
                self.stdout.write(f"  Trimestre cree : {nom}")
            else:
                self.stdout.write(f"  Trimestre existant : {nom}")
        self.stdout.write(f"Trimestres : {nb_t} cree(s)")

        self.stdout.write("")
        self.stdout.write("Termine ! Prochaines etapes :")
        self.stdout.write("  1. Ajouter des enseignants (menu Enseignants)")
        self.stdout.write("  2. Ajouter des matieres (menu Matieres)")
        self.stdout.write("  3. Affecter cours aux niveaux (menu Affectation Cours)")
        self.stdout.write("  4. Ajouter des eleves (menu Eleves)")
        self.stdout.write("  5. Inscrire les eleves dans les niveaux (menu Inscriptions)")
