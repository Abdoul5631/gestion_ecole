"""
Réduit Wend-Panga à un jeu de test modeste et comble uniquement les modules vides.
À lancer une fois : python _trim_and_fill.py
"""
from __future__ import annotations

import os
import random
from datetime import date, timedelta, time
from io import BytesIO
from pathlib import Path

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
os.environ.setdefault("PYTHONUNBUFFERED", "1")

import django

django.setup()

from django.contrib.auth.hashers import make_password
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Count, Q

from accounts.models import User
from caisse.models import DossierScolarite, Paiement, TarifNiveau
from caisse.services import ouvrir_dossier, enregistrer_paiement
from cours.models import ClasseMatiere, EmploiDuTemps, Enseignant, Matiere
from eleves.models import AppelJournalier, Eleve, Presence
from evaluations.models import Evaluation, Note
from notifications.models import Notification, SmsOutbox
from notifications.services import creer_notification
from parametres.models import Parametres
from scolarite.models import (
    AnneeScolaire,
    Classe,
    Inscription,
    Niveau,
    ResultatExamenNational,
    Trimestre,
)
from scolarite.utils import jours_scolaires_recents

MOT_DE_PASSE = "Ecole2025!"
PROTEGES = {"hamidtoe450", "admin", "enseignant", "eleve", "parent", "superadmin"}
CLASSES_ACTIVES = ("6ème A", "5ème B", "3ème A")  # ~8 élèves chacune
ELEVES_PAR_CLASSE = 8
rng = random.Random(7)


def _tiny_jpeg(label: str) -> bytes:
    """Mini JPEG sans dépendance PIL (1x1 coloré via header minimal + padding)."""
    # JPEG minimal 1x1 rouge — suffisant pour ImageField
    return bytes([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
        0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
        0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
        0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
        0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
        0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
        0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
        0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
        0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
        0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
        0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
        0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
        0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
        0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
        0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
        0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
        0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
        0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
        0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
        0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
        0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
        0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
        0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
        0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
        0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
        0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
        0x00, 0x00, 0x3F, 0x00, 0x7F, 0x46, 0x80, 0xFF, 0xD9,
    ])


def log(msg: str):
    print(msg, flush=True)


def counts(ecole, label):
    annee = AnneeScolaire.objects.filter(ecole=ecole, is_active=True).first()
    data = {
        "classes": Classe.objects.filter(ecole=ecole).count(),
        "eleves": Eleve.objects.filter(ecole=ecole).count(),
        "inscriptions": Inscription.objects.filter(ecole=ecole, annee_scolaire=annee).count() if annee else 0,
        "enseignants": Enseignant.objects.filter(ecole=ecole).count(),
        "matieres": Matiere.objects.filter(ecole=ecole).count(),
        "edt": EmploiDuTemps.objects.filter(ecole=ecole).count(),
        "notes": Note.objects.filter(ecole=ecole).count(),
        "presences": Presence.objects.filter(ecole=ecole).count(),
        "appels": AppelJournalier.objects.filter(ecole=ecole).count(),
        "dossiers": DossierScolarite.objects.filter(ecole=ecole).count(),
        "paiements": Paiement.objects.filter(ecole=ecole).count(),
        "notifications": Notification.objects.filter(ecole=ecole).count(),
        "evals": Evaluation.objects.filter(ecole=ecole).count(),
        "photos": Eleve.objects.filter(ecole=ecole).exclude(Q(photo="") | Q(photo__isnull=True)).count(),
        "users": User.objects.filter(ecole=ecole).count(),
    }
    log(f"--- {label} ---")
    for k, v in data.items():
        log(f"  {k}: {v}")
    return annee, data


@transaction.atomic
def trim_wend_panga(wp: Parametres):
    annee = AnneeScolaire.objects.filter(ecole=wp, is_active=True).first()
    if not annee:
        raise SystemExit("Pas d'année active pour Wend-Panga")

    # Élèves protégés (liés aux comptes de test)
    u_eleve = User.objects.filter(username="eleve").first()
    u_parent = User.objects.filter(username="parent").first()
    keep_ids = set()
    if u_eleve and u_eleve.eleve_id:
        keep_ids.add(u_eleve.eleve_id)
    if u_parent:
        if u_parent.eleve_id:
            keep_ids.add(u_parent.eleve_id)
        keep_ids.update(u_parent.enfants.values_list("id", flat=True))

    # Classes cibles
    classes_map = {
        c.nom: c
        for c in Classe.objects.filter(ecole=wp, nom__in=CLASSES_ACTIVES)
    }
    for nom in CLASSES_ACTIVES:
        if nom not in classes_map:
            log(f"  WARN classe manquante: {nom}")

    # Sélectionner ~8 élèves / classe active (en gardant les protégés)
    keep_ids_final = set(keep_ids)
    for nom, classe in classes_map.items():
        insc = list(
            Inscription.objects.filter(classe=classe, annee_scolaire=annee)
            .select_related("eleve")
            .order_by("eleve_id")
        )
        deja = [i.eleve_id for i in insc if i.eleve_id in keep_ids_final]
        autres = [i.eleve_id for i in insc if i.eleve_id not in keep_ids_final]
        besoin = max(0, ELEVES_PAR_CLASSE - len(deja))
        keep_ids_final.update(deja)
        keep_ids_final.update(autres[:besoin])

    # Si un protégé est hors classes actives, le garder quand même
    keep_ids_final |= keep_ids
    log(f"Élèves conservés: {len(keep_ids_final)} (dont protégés {keep_ids})")

    drop_eleves = Eleve.objects.filter(ecole=wp).exclude(id__in=keep_ids_final)
    drop_ids = list(drop_eleves.values_list("id", flat=True))
    log(f"Élèves à supprimer: {len(drop_ids)}")

    # Supprimer données lourdes liées aux élèves hors sélection
    Note.objects.filter(eleve_id__in=drop_ids).delete()
    Presence.objects.filter(eleve_id__in=drop_ids).delete()
    AppelJournalier.objects.filter(eleve_id__in=drop_ids).delete()
    ResultatExamenNational.objects.filter(eleve_id__in=drop_ids).delete()

    # Dossiers / paiements via inscriptions
    insc_drop = Inscription.objects.filter(eleve_id__in=drop_ids)
    dossiers = DossierScolarite.objects.filter(inscription__in=insc_drop)
    Paiement.objects.filter(dossier__in=dossiers).delete()
    dossiers.delete()
    insc_drop.delete()

    # Users élèves/parents liés (sauf protégés)
    User.objects.filter(eleve_id__in=drop_ids).exclude(username__in=PROTEGES).delete()
    # Nettoyer M2M enfants
    for u in User.objects.filter(role="PARENT", ecole=wp).exclude(username__in=PROTEGES):
        if not u.enfants.filter(id__in=keep_ids_final).exists() and (
            not u.eleve_id or u.eleve_id not in keep_ids_final
        ):
            u.delete()

    drop_eleves.delete()

    # Vider notes / présences restantes (on recrée un petit jeu)
    Note.objects.filter(ecole=wp).delete()
    Presence.objects.filter(ecole=wp).delete()
    AppelJournalier.objects.filter(ecole=wp).delete()

    # Garder peu d'évaluations : T1, DEVOIR1 + COMPOSITION, classes actives, 5 matières max
    classes_actives = list(classes_map.values())
    cms_actifs = list(
        ClasseMatiere.objects.filter(classe__in=classes_actives, ecole=wp, is_active=True)
        .select_related("matiere", "classe")
        .order_by("classe_id", "id")
    )
    # Limiter à 5 CM par classe
    cms_keep = []
    per_classe = {}
    for cm in cms_actifs:
        n = per_classe.get(cm.classe_id, 0)
        if n < 5:
            cms_keep.append(cm)
            per_classe[cm.classe_id] = n + 1
    cms_keep_ids = {cm.id for cm in cms_keep}

    t1 = Trimestre.objects.filter(annee_scolaire=annee, nom__icontains="1", ecole=wp).first()
    if not t1:
        t1 = Trimestre.objects.filter(annee_scolaire=annee, ecole=wp).order_by("id").first()

    Evaluation.objects.filter(ecole=wp).exclude(
        classe_matiere_id__in=cms_keep_ids, trimestre=t1, type__in=["DEVOIR1", "COMPOSITION"]
    ).delete()

    # S'assurer que DEVOIR1 + COMPOSITION existent
    evals = []
    for cm in cms_keep:
        for typ, coef, d in (
            ("DEVOIR1", 1.0, date(annee.libelle[:4].isdigit() and int(annee.libelle[:4]) or 2026, 11, 10)),
            ("COMPOSITION", 2.0, date(annee.libelle[:4].isdigit() and int(annee.libelle[:4]) or 2026, 12, 12)),
        ):
            ev, _ = Evaluation.objects.get_or_create(
                type=typ,
                trimestre=t1,
                classe_matiere=cm,
                defaults={"coefficient": coef, "date": d, "is_active": True, "ecole": wp},
            )
            if ev.ecole_id != wp.id:
                ev.ecole = wp
                ev.save(update_fields=["ecole"])
            evals.append(ev)

    # Notes modestes
    eleves_par_classe = {}
    for ins in Inscription.objects.filter(
        annee_scolaire=annee, eleve_id__in=keep_ids_final
    ).select_related("eleve"):
        eleves_par_classe.setdefault(ins.classe_id, []).append(ins.eleve)

    notes = []
    for ev in evals:
        for eleve in eleves_par_classe.get(ev.classe_matiere.classe_id, []):
            val = round(rng.uniform(4, 19) * 2) / 2
            if rng.random() < 0.05:
                val = 0.0
            notes.append(Note(valeur=val, evaluation=ev, eleve=eleve, ecole=wp))
    Note.objects.bulk_create(notes, batch_size=400)
    log(f"Notes créées: {len(notes)}")

    # Présences : 3 jours × 2 CM × élèves des classes actives
    jours = jours_scolaires_recents(3)
    pres = []
    for classe in classes_actives:
        cms = [cm for cm in cms_keep if cm.classe_id == classe.id][:2]
        eleves = eleves_par_classe.get(classe.id, [])
        for cm in cms:
            for jour in jours:
                for i, eleve in enumerate(eleves):
                    if i == 0:
                        statut = "ABSENT"
                    elif i == 1:
                        statut = "RETARD"
                    elif i == 2 and rng.random() < 0.5:
                        statut = "EXCUSE"
                    else:
                        statut = "PRESENT"
                    pres.append(
                        Presence(
                            eleve=eleve,
                            classe_matiere=cm,
                            date=jour,
                            statut=statut,
                            ecole=wp,
                        )
                    )
    Presence.objects.bulk_create(pres, batch_size=400)
    log(f"Présences créées: {len(pres)}")

    # EDT : réduire à quelques créneaux pour classes actives
    EmploiDuTemps.objects.filter(ecole=wp).exclude(
        classe_matiere_id__in=cms_keep_ids
    ).delete()
    EmploiDuTemps.objects.filter(ecole=wp, classe_matiere_id__in=cms_keep_ids).delete()
    jours_edt = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI"]
    # Adapt to actual field choices
    jour_field = EmploiDuTemps._meta.get_field("jour")
    if getattr(jour_field, "choices", None):
        jours_edt = [c[0] for c in jour_field.choices][:5]
    edt_rows = []
    for i, cm in enumerate(cms_keep):
        edt_rows.append(
            EmploiDuTemps(
                classe_matiere=cm,
                jour=jours_edt[i % len(jours_edt)],
                heure_debut=time(8 + (i % 4), 0),
                heure_fin=time(9 + (i % 4), 0),
                salle=f"S{100 + (i % 6)}",
                is_active=True,
                ecole=wp,
            )
        )
    EmploiDuTemps.objects.bulk_create(edt_rows)
    log(f"EDT créneaux: {len(edt_rows)}")

    # Appels journaliers (module vide) — 2 jours
    appels = []
    for classe in classes_actives:
        eleves = eleves_par_classe.get(classe.id, [])
        for jour in jours[:2]:
            for i, eleve in enumerate(eleves):
                statut = "ABSENT" if i == 0 else ("RETARD" if i == 1 else "PRESENT")
                appels.append(
                    AppelJournalier(
                        eleve=eleve, classe=classe, date=jour, statut=statut, ecole=wp
                    )
                )
    AppelJournalier.objects.bulk_create(appels, batch_size=400)
    log(f"Appels créés: {len(appels)}")

    # Photos : 4 élèves sans photo
    sans_photo = list(
        Eleve.objects.filter(ecole=wp, id__in=keep_ids_final)
        .filter(Q(photo="") | Q(photo__isnull=True))[:4]
    )
    jpeg = _tiny_jpeg("demo")
    for e in sans_photo:
        e.photo.save(f"{e.matricule}.jpg", ContentFile(jpeg), save=True)
    log(f"Photos ajoutées: {len(sans_photo)}")

    # Caisse : s'assurer soldé / partiel / impayé sur les dossiers restants
    dossiers = []
    for ins in Inscription.objects.filter(
        annee_scolaire=annee, eleve_id__in=keep_ids_final
    ).select_related("classe__niveau"):
        dossiers.append(ouvrir_dossier(ins))

    # Remettre paiements propres pour 3 premiers dossiers
    today = date.today()
    for i, d in enumerate(dossiers[:6]):
        Paiement.objects.filter(dossier=d).delete()
        d.composition_bloquee = False
        t = int(d.montant_du or 45000) // 3
        if i % 3 == 0:
            for tr, days in ((1, 40), (2, 20), (3, 5)):
                enregistrer_paiement(
                    d, tranche=tr, montant=t, date_paiement=today - timedelta(days=days), mode="ESPECES"
                )
        elif i % 3 == 1:
            enregistrer_paiement(
                d, tranche=1, montant=t, date_paiement=today - timedelta(days=20), mode="MOBILE"
            )
        else:
            d.rafraichir_statut()
            d.save()
    log(f"Dossiers caisse rafraîchis: {len(dossiers)} (échantillon soldé/partiel/impayé)")

    # Messages parents : 2–3 si peu
    parent = User.objects.filter(username="parent").first()
    n_msg = Notification.objects.filter(destinataire=parent).count() if parent else 0
    if parent and n_msg < 3:
        enfants = list(parent.enfants.all())[:2]
        el = enfants[0] if enfants else parent.eleve
        creer_notification(
            destinataire=parent,
            type="INFO",
            titre="Réunion parents-profs",
            message="Réunion prévue le vendredi prochain à 16h dans la salle polyvalente.",
            eleve=el,
            lien="/messages",
        )
        creer_notification(
            destinataire=parent,
            type="FRAIS",
            titre="Rappel frais de scolarité",
            message="Merci de régulariser la tranche en cours avant fin de mois.",
            eleve=el,
            lien="/mes-frais",
        )
        creer_notification(
            destinataire=parent,
            type="BULLETIN",
            titre="Bulletin Trimestre 1 disponible",
            message="Le bulletin du Trimestre 1 est consultable dans votre espace.",
            eleve=el,
            lien="/mon-bulletin",
        )
        Notification.objects.filter(destinataire=parent, ecole__isnull=True).update(ecole=wp)
        log("Messages parent ajoutés: 3")
    else:
        log(f"Messages parent déjà présents: {n_msg} (pas d'ajout massif)")
    # Statut école
    wp.statut = Parametres.STATUT_VALIDEE
    wp.motif = ""
    wp.save(update_fields=["statut", "motif"])

    # Réduire notifications SMS bruit excessif (garder ~30)
    extra = list(Notification.objects.filter(ecole=wp).order_by("-id")[40:].values_list("id", flat=True))
    if extra:
        Notification.objects.filter(id__in=extra).delete()
        log(f"Notifications en trop supprimées: {len(extra)}")
    extra_sms = list(SmsOutbox.objects.filter(ecole=wp).order_by("-id")[30:].values_list("id", flat=True))
    if extra_sms:
        SmsOutbox.objects.filter(id__in=extra_sms).delete()

    return keep_ids_final


def ensure_banfora(pwd_hash: str):
    """Petite école Banfora (ne touche pas Savoir)."""
    ecole, created = Parametres.objects.get_or_create(
        nom_ecole="École Test Banfora",
        defaults={
            "ville": "Banfora",
            "telephone": "+226 20 91 00 11",
            "email": "directeur@banfora-test.bf",
            "directeur": "Awa Sanou",
            "slogan": "École de démonstration (isolation)",
            "statut": Parametres.STATUT_VALIDEE,
        },
    )
    ecole.statut = Parametres.STATUT_VALIDEE
    ecole.save(update_fields=["statut"])

    from scolarite.utils import annee_scolaire_courante

    libelle, _ = annee_scolaire_courante()
    annee, _ = AnneeScolaire.objects.get_or_create(
        libelle=libelle, ecole=ecole, defaults={"is_active": True}
    )
    annee.is_active = True
    annee.save(update_fields=["is_active"])
    for nom in ("Trimestre 1", "Trimestre 2", "Trimestre 3"):
        Trimestre.objects.get_or_create(
            nom=nom, annee_scolaire=annee, defaults={"is_active": True, "ecole": ecole}
        )
    niveau, _ = Niveau.objects.get_or_create(
        nom="6ème", ecole=ecole, defaults={"is_active": True}
    )
    ens, _ = Enseignant.objects.get_or_create(
        nom="Sanou", prenom="Issa", ecole=ecole, defaults={"is_active": True}
    )
    matiere, _ = Matiere.objects.get_or_create(
        nom="Mathématiques", ecole=ecole, defaults={"type": "SCIENTIFIQUE"}
    )
    classe, _ = Classe.objects.get_or_create(
        nom="6ème A",
        niveau=niveau,
        defaults={"is_active": True, "ecole": ecole, "professeur_principal": ens},
    )
    ClasseMatiere.objects.get_or_create(
        classe=classe,
        matiere=matiere,
        defaults={"enseignant": ens, "coef": 4, "is_active": True, "ecole": ecole},
    )
    if Eleve.objects.filter(ecole=ecole).count() == 0:
        eleve, _ = Eleve.objects.get_or_create(
            matricule="BAN-0001",
            ecole=ecole,
            defaults={"nom": "Ouattara", "prenom": "Fatou", "is_active": True},
        )
        Inscription.objects.get_or_create(
            eleve=eleve, annee_scolaire=annee, defaults={"classe": classe, "ecole": ecole}
        )
    admin, created_u = User.objects.get_or_create(
        username="admin_banfora",
        defaults={
            "email": "directeur@banfora-test.bf",
            "role": "ADMIN",
            "ecole": ecole,
            "first_name": "Awa",
            "last_name": "Sanou",
            "is_staff": True,
            "is_active": True,
            "password": pwd_hash,
        },
    )
    if created_u or admin.ecole_id != ecole.id:
        admin.ecole = ecole
        admin.role = "ADMIN"
        admin.password = pwd_hash
        admin.is_active = True
        admin.save()
    log(f"Banfora: id={ecole.pk} eleves={Eleve.objects.filter(ecole=ecole).count()} (créée={created})")


def ensure_passwords():
    pwd = make_password(MOT_DE_PASSE)
    for uname in ("admin", "enseignant", "eleve", "parent", "superadmin", "admin_banfora"):
        u = User.objects.filter(username=uname).first()
        if u:
            u.password = pwd
            u.is_active = True
            if uname == "superadmin":
                u.role = "SUPER_ADMIN"
                u.is_plateforme = True
                u.ecole = None
            u.save()
            log(f"  password OK: {uname}")
    # hamidtoe450 : ne pas écraser
    h = User.objects.filter(username="hamidtoe450").first()
    if h:
        h.is_active = True
        h.role = "ADMIN"
        h.save(update_fields=["is_active", "role"])
        log("  hamidtoe450 conservé (mdp inchangé)")


def main():
    wp = Parametres.objects.filter(nom_ecole__icontains="Wend").first() or Parametres.objects.get(pk=1)
    log("=== AVANT ===")
    counts(wp, "Wend-Panga")
    savoir = Parametres.objects.filter(nom_ecole__icontains="Savoir").first()
    if savoir:
        counts(savoir, "Savoir (inchangé volontairement)")

    log("\n=== TRIM + FILL Wend-Panga ===")
    trim_wend_panga(wp)

    log("\n=== Banfora (petite) ===")
    ensure_banfora(make_password(MOT_DE_PASSE))

    log("\n=== Mots de passe test ===")
    ensure_passwords()

    log("\n=== APRÈS ===")
    counts(wp, "Wend-Panga")
    bf = Parametres.objects.filter(nom_ecole__icontains="Banfora").first()
    if bf:
        counts(bf, "Banfora")
    if savoir:
        counts(savoir, "Savoir")

    log("\nComptes de test :")
    log(f"  Mot de passe (sauf hamidtoe450) : {MOT_DE_PASSE}")
    for uname in ("hamidtoe450", "admin", "enseignant", "eleve", "parent", "superadmin", "admin_banfora"):
        u = User.objects.filter(username=uname).first()
        if u:
            log(f"  {uname:16} role={u.role:12} ecole_id={u.ecole_id}")


if __name__ == "__main__":
    main()
