"""Politique des droits d'accès de l'API — l'unique endroit où ils sont décidés.

Règles :
  * une action **absente** de cette table est **interdite** (refusé par défaut) ;
  * l'école doit être validée et l'utilisateur connecté (EcoleAccesPermission) : toujours exigé ;
  * ce fichier donne le rôle minimal ; le filtrage des données (un parent ne voit que ses enfants,
    un enseignant que ses cours, tout dans la limite de son école) est fait par get_queryset / scoped().

Le test config/tests_droits.py compare cette politique à l'API réelle : modifier un droit
sans mettre à jour ce fichier (et la matrice de référence) fait échouer les tests.
"""

# Groupes de rôles
ADMIN = ('ADMIN',)                                          # directeur d'école
ENSEIGNANT = ('ENSEIGNANT',)
PERSONNEL = ('ADMIN', 'ENSEIGNANT')                         # direction + enseignants
FAMILLE = ('ELEVE', 'PARENT')
ADMIN_FAMILLE = ('ADMIN', 'ELEVE', 'PARENT')                # finances : direction + élève/parent concernés
TOUS = ('ADMIN', 'ENSEIGNANT', 'ELEVE', 'PARENT')           # tout compte d'une école
SECRETAIRE = ('SECRETAIRE',)
COMPTABLE = ('COMPTABLE',)
SURVEILLANT = ('SURVEILLANT',)
COMMUNICATION = ('COMMUNICATION',)                          # responsable du site public (désigné par le directeur)
PERSONNEL_ECOLE = SECRETAIRE + COMPTABLE + SURVEILLANT      # rôles intermédiaires créés par le directeur
TOUS_ET_PERSONNEL = TOUS + PERSONNEL_ECOLE                  # lecture de la structure de l'école (classes, niveaux…)
# Le directeur supervise (lecture) ; la saisie appartient au rôle qui fait le travail.
SECRETARIAT = ('ADMIN',) + SECRETAIRE                       # lecture : inscriptions, élèves, dossiers
CAISSE = ('ADMIN',) + COMPTABLE                             # lecture : tarifs, frais, paiements
SITE_PUBLIC = ('ADMIN',) + COMMUNICATION                    # actualités et vitrine : le directeur et son responsable du site
VIE_SCOLAIRE = ('ADMIN',) + SURVEILLANT                     # lecture : absents du jour
# Écriture : seul le rôle concerné (le directeur voit mais ne saisit pas)
SAISIE_SECRETARIAT = SECRETAIRE
SAISIE_CAISSE = COMPTABLE
SAISIE_VIE_SCOLAIRE = SURVEILLANT
SAISIE_PEDAGOGIE = ENSEIGNANT                               # présences par cours
SAISIE_NOTES = ENSEIGNANT + SECRETAIRE                      # devoirs et notes : enseignant (ses cours), secrétaire (toutes les classes)


def _lecture(roles=TOUS):
    return {'list': roles, 'retrieve': roles}


def _ecriture(roles=ADMIN):
    return {a: roles for a in ('create', 'update', 'partial_update', 'destroy')}


def _referentiel(**extra):
    """Données de structure de l'école : lecture pour tous, écriture réservée à la direction."""
    return {**_lecture(TOUS_ET_PERSONNEL), **_ecriture(ADMIN), 'reactiver': ADMIN, **extra}


def _tout_admin(*actions):
    return {a: ADMIN for a in actions}


DROITS = {
    # ── Structure scolaire ────────────────────────────────────────────────────────────────────────
    'AnneeScolaireViewSet': {**_lecture(TOUS_ET_PERSONNEL), **_ecriture(), 'active': TOUS_ET_PERSONNEL, 'en_cours': ADMIN, 'contenu': ADMIN},
    'NiveauViewSet': _referentiel(),
    'ClasseViewSet': _referentiel(cartes=SECRETAIRE, cartes_apercu=SECRETAIRE, liste_pdf=('ADMIN',) + PERSONNEL_ECOLE),
    'ActualiteViewSet': {**_lecture(SITE_PUBLIC), **_ecriture(SITE_PUBLIC)},
    'TrimestreViewSet': {**_lecture(TOUS_ET_PERSONNEL), **_ecriture(), 'bulletins': ADMIN, 'contenu': ADMIN},
    'MatiereViewSet': _referentiel(),
    'ClasseMatiereViewSet': _referentiel(copier=ADMIN),
    'EmploiDuTempsViewSet': _referentiel(aujourdhui=ENSEIGNANT),
    'InscriptionViewSet': {
        **_lecture(TOUS_ET_PERSONNEL), **_ecriture(SAISIE_SECRETARIAT), 'reactiver': SAISIE_SECRETARIAT,
        'reinscription': SAISIE_SECRETARIAT, 'passage_apercu': ADMIN, 'passage_lancer': ADMIN,
        # le directeur et le secrétaire : mettre un élève en classe, le changer de classe, le retirer (suspendre) et le réintégrer
        **{a: SECRETARIAT for a in ('create', 'update', 'partial_update', 'destroy', 'reactiver')},
    },
    'PassageAnneeViewSet': {'list': ADMIN},
    'ResultatExamenNationalViewSet': _tout_admin(
        'list', 'retrieve', 'create', 'update', 'partial_update', 'destroy',
        'candidats', 'importer_excel', 'importer_texte', 'saisir'),

    # ── Personnes ─────────────────────────────────────────────────────────────────────────────────
    'EleveViewSet': {
        **_lecture(TOUS_ET_PERSONNEL), **_ecriture(SAISIE_SECRETARIAT), 'reactiver': SAISIE_SECRETARIAT,
        'prochain_matricule': SECRETARIAT,
        'create': SECRETARIAT,  # ajouter un élève : directeur et secrétaire (fiche + compte élève créés ensemble)
        'appels': TOUS_ET_PERSONNEL, 'inscriptions': TOUS_ET_PERSONNEL, 'presences': TOUS_ET_PERSONNEL, 'ma_classe': FAMILLE,
        'carte': SECRETAIRE, 'corriger_nom': ADMIN, 'documents': SECRETARIAT, 'document': SECRETARIAT, 'compte_parent': SECRETARIAT,
        'creer_comptes_parents': SAISIE_SECRETARIAT, 'creer_comptes_manquants': SAISIE_SECRETARIAT,
        'template_excel': SECRETARIAT, 'import_excel': SECRETARIAT,  # import en masse : directeur et secrétaire
    },
    'EnseignantViewSet': {
        **_lecture(PERSONNEL), **_ecriture(), 'reactiver': ADMIN,
        'matieres': PERSONNEL, 'ma_signature': ENSEIGNANT,
    },
    # Journal d'activité : le directeur (son école) et le super admin (toutes les écoles) ; personne ne le modifie
    'JournalActionViewSet': {'list': ADMIN + ('SUPER_ADMIN',), 'filtres': ADMIN + ('SUPER_ADMIN',)},
    'UserViewSet': _tout_admin('list', 'retrieve', 'create', 'update', 'partial_update', 'destroy', 'reactiver'),
    'DemandeInscriptionViewSet': {
        **{a: SECRETARIAT for a in ('list', 'retrieve', 'piece')},
        **{a: SAISIE_SECRETARIAT for a in ('create', 'update', 'partial_update', 'destroy', 'reactiver', 'accepter', 'refuser')},
    },

    # ── Vie scolaire : présences, exercices ──────────────────────────────────────────────────────
    'PresenceViewSet': {
        **_lecture(TOUS + SURVEILLANT), **_ecriture(SAISIE_PEDAGOGIE),
        'saisie_masse': SAISIE_PEDAGOGIE, 'appel_du_jour': ADMIN, 'absents_du_jour': VIE_SCOLAIRE,
        'justifier': ADMIN,  # justifier une absence : le directeur seul
    },
    'AppelJournalierViewSet': {**_lecture(TOUS + SURVEILLANT), **_ecriture(SAISIE_VIE_SCOLAIRE), 'saisie_masse': SAISIE_VIE_SCOLAIRE},
    'ExerciceViewSet': {
        **_lecture(), 'create': ENSEIGNANT, 'update': ENSEIGNANT, 'partial_update': ENSEIGNANT,
        'destroy': SAISIE_PEDAGOGIE, 'reactiver': SAISIE_PEDAGOGIE,
    },

    # ── Évaluations et notes ─────────────────────────────────────────────────────────────────────
    'EvaluationViewSet': {
        **_lecture(TOUS + SECRETAIRE), **_ecriture(SAISIE_NOTES + ADMIN),
        'carnet': PERSONNEL + SECRETAIRE, 'notes': PERSONNEL + SECRETAIRE, 'generer': SECRETARIAT,
    },
    'NoteViewSet': {
        **_lecture(TOUS + SECRETAIRE), **_ecriture(SAISIE_NOTES), 'saisie_masse': SAISIE_NOTES, 'publier_bulletin': ADMIN,
        # Les bulletins ne regardent pas les enseignants : direction, élève et parents seulement
        'bulletin': ADMIN_FAMILLE, 'bulletin_pdf': ADMIN_FAMILLE, 'bulletin_examen_blanc': ADMIN_FAMILLE,
        'classement': ADMIN, 'classement_examen_blanc': ADMIN_FAMILLE,
        # duplicata : le directeur seul, toutes années confondues
        'historique_bulletins': ADMIN, 'duplicata_bulletin': ADMIN,
    },
    # compositions et examens blancs : programmés par le directeur ou le secrétaire
    'CalendrierCompositionViewSet': {**_lecture(TOUS_ET_PERSONNEL), **_ecriture(SECRETARIAT), 'reactiver': SECRETARIAT,
                                     'publier': SECRETARIAT, 'retirer': SECRETARIAT},
    'ProgrammeCompositionViewSet': {**_lecture(), **_ecriture(SECRETARIAT)},
    'CalendrierExamenBlancViewSet': {**_lecture(TOUS_ET_PERSONNEL), **_ecriture(SECRETARIAT), 'reactiver': SECRETARIAT,
                                     'publier': SECRETARIAT, 'retirer': SECRETARIAT},
    'ProgrammeExamenBlancViewSet': {**_lecture(), **_ecriture(SECRETARIAT)},
    'DeliberationViewSet': {**_lecture(PERSONNEL), **_ecriture()},

    # ── Caisse ────────────────────────────────────────────────────────────────────────────────────
    'TarifNiveauViewSet': {a: CAISSE for a in ('list', 'retrieve', 'create', 'update', 'partial_update', 'destroy', 'reactiver')},
    'DossierScolariteViewSet': {
        # Le directeur n'a rien à voir avec les paiements ; les dossiers ne se modifient pas (seulement : encaisser, relancer, informer)
        **_lecture(FAMILLE + COMPTABLE),
        'paiement': SAISIE_CAISSE, 'ouvrir_manquants': SAISIE_CAISSE, 'relancer': SAISIE_CAISSE, 'informer': SAISIE_CAISSE,
        'certificat_non_redevance': SAISIE_CAISSE,
    },
    'PaiementViewSet': _lecture(FAMILLE + COMPTABLE),
    'DepenseViewSet': {**_lecture(COMPTABLE), **_ecriture(SAISIE_CAISSE), 'bilan': COMPTABLE, 'journal': COMPTABLE},

    # ── Communication ────────────────────────────────────────────────────────────────────────────
    # le super admin a ses propres notifications (nouvelle école, erreur, changement d'e-mail d'un directeur)
    'NotificationViewSet': {**_lecture(TOUS_ET_PERSONNEL + ('SUPER_ADMIN',)), 'non_lues': TOUS_ET_PERSONNEL + ('SUPER_ADMIN',),
                            'lire': TOUS_ET_PERSONNEL + ('SUPER_ADMIN',), 'tout_lire': TOUS_ET_PERSONNEL + ('SUPER_ADMIN',)},
    'SmsOutboxViewSet': _tout_admin('list', 'retrieve', 'config', 'envoyer', 'relancer', 'envois'),
}


def droits_de(nom_vue):
    """Politique d'une vue ({action: rôles}) ; vide (donc tout interdit) si la vue n'est pas déclarée."""
    return DROITS.get(nom_vue, {})
