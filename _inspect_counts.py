"""Inspect DB counts for Wend-Panga and Banfora."""
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.apps import apps
from django.db.models import Count, Q
from parametres.models import Parametres
from accounts.models import User
from scolarite.models import Niveau, Classe, AnneeScolaire, Trimestre, Inscription
from cours.models import Enseignant, Matiere, ClasseMatiere, EmploiDuTemps
from eleves.models import Eleve, Presence, AppelJournalier
from evaluations.models import Evaluation, Note, CalendrierComposition, Deliberation
from caisse.models import TarifNiveau, DossierScolarite, Paiement
from notifications.models import Notification, SmsOutbox

print("=== ECOLES ===")
for e in Parametres.objects.all():
    print(f"  id={e.pk} nom={e.nom_ecole!r} statut={e.statut}")

wp = Parametres.objects.filter(nom_ecole__icontains="Wend").first() or Parametres.objects.filter(pk=1).first()
bf = Parametres.objects.filter(nom_ecole__icontains="Banfora").first()
print(f"WP={wp.pk if wp else None} BF={bf.pk if bf else None}")

def counts_for(ecole, label):
    print(f"\n=== {label} (id={ecole.pk}) ===")
    annee = AnneeScolaire.objects.filter(ecole=ecole, is_active=True).first()
    print(f"  annee active: {annee}")
    qs = {
        "niveaux": Niveau.objects.filter(ecole=ecole).count(),
        "classes": Classe.objects.filter(ecole=ecole).count(),
        "enseignants": Enseignant.objects.filter(ecole=ecole).count(),
        "matieres": Matiere.objects.filter(ecole=ecole).count(),
        "classe_matieres": ClasseMatiere.objects.filter(ecole=ecole).count(),
        "edt": EmploiDuTemps.objects.filter(classe_matiere__ecole=ecole).count() if hasattr(EmploiDuTemps.objects.first() or type('x',(),{})(), 'classe_matiere') else EmploiDuTemps.objects.filter(ecole=ecole).count() if 'ecole' in [f.name for f in EmploiDuTemps._meta.fields] else EmploiDuTemps.objects.count(),
        "eleves": Eleve.objects.filter(ecole=ecole).count(),
        "inscriptions_annee": Inscription.objects.filter(ecole=ecole, annee_scolaire=annee).count() if annee else 0,
        "inscriptions_total": Inscription.objects.filter(ecole=ecole).count(),
        "trimestres": Trimestre.objects.filter(ecole=ecole).count(),
        "evaluations": Evaluation.objects.filter(ecole=ecole).count() if 'ecole' in [f.name for f in Evaluation._meta.fields] else Evaluation.objects.count(),
        "notes": Note.objects.filter(ecole=ecole).count() if 'ecole' in [f.name for f in Note._meta.fields] else Note.objects.count(),
        "presences": Presence.objects.filter(ecole=ecole).count() if 'ecole' in [f.name for f in Presence._meta.fields] else Presence.objects.count(),
        "appels": AppelJournalier.objects.filter(ecole=ecole).count() if 'ecole' in [f.name for f in AppelJournalier._meta.fields] else AppelJournalier.objects.count(),
        "tarifs": TarifNiveau.objects.filter(ecole=ecole).count() if 'ecole' in [f.name for f in TarifNiveau._meta.fields] else TarifNiveau.objects.count(),
        "dossiers": DossierScolarite.objects.filter(ecole=ecole).count() if 'ecole' in [f.name for f in DossierScolarite._meta.fields] else DossierScolarite.objects.count(),
        "paiements": Paiement.objects.filter(ecole=ecole).count() if 'ecole' in [f.name for f in Paiement._meta.fields] else Paiement.objects.count(),
        "notifications": Notification.objects.filter(ecole=ecole).count() if 'ecole' in [f.name for f in Notification._meta.fields] else Notification.objects.count(),
        "sms": SmsOutbox.objects.filter(ecole=ecole).count() if 'ecole' in [f.name for f in SmsOutbox._meta.fields] else SmsOutbox.objects.count(),
        "calendriers_comp": CalendrierComposition.objects.filter(ecole=ecole).count() if 'ecole' in [f.name for f in CalendrierComposition._meta.fields] else CalendrierComposition.objects.count(),
        "deliberations": Deliberation.objects.filter(ecole=ecole).count() if 'ecole' in [f.name for f in Deliberation._meta.fields] else Deliberation.objects.count(),
        "users": User.objects.filter(ecole=ecole).count(),
        "photos_eleves": Eleve.objects.filter(ecole=ecole).exclude(Q(photo='') | Q(photo__isnull=True)).count() if 'photo' in [f.name for f in Eleve._meta.fields] else -1,
    }
    for k, v in qs.items():
        print(f"  {k}: {v}")
    return annee, qs

# Field introspection helpers
print("\n=== FIELD LISTS ===")
for name, model in [
    ("EmploiDuTemps", EmploiDuTemps), ("Note", Note), ("Presence", Presence),
    ("AppelJournalier", AppelJournalier), ("Evaluation", Evaluation),
    ("Notification", Notification), ("Eleve", Eleve), ("Paiement", Paiement),
    ("DossierScolarite", DossierScolarite),
]:
    print(f"  {name}: {[f.name for f in model._meta.fields]}")

if wp:
    counts_for(wp, "WEND-PANGA")
if bf:
    counts_for(bf, "BANFORA")

print("\n=== USERS (important) ===")
for u in User.objects.filter(username__in=["hamidtoe450","admin","enseignant","eleve","parent","superadmin","admin_banfora"]).order_by("username"):
    print(f"  {u.username} role={u.role} ecole_id={u.ecole_id} active={u.is_active}")

print("\n=== GLOBAL HEAVY TABLES ===")
print(f"  Note: {Note.objects.count()}")
print(f"  Presence: {Presence.objects.count()}")
print(f"  Eleve: {Eleve.objects.count()}")
print(f"  Inscription: {Inscription.objects.count()}")
print(f"  AppelJournalier: {AppelJournalier.objects.count()}")
print(f"  Evaluation: {Evaluation.objects.count()}")
print(f"  EmploiDuTemps: {EmploiDuTemps.objects.count()}")
print(f"  Notification: {Notification.objects.count()}")
print(f"  Paiement: {Paiement.objects.count()}")
print(f"  DossierScolarite: {DossierScolarite.objects.count()}")
