from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from eleves.views import EleveViewSet, PresenceViewSet, AppelJournalierViewSet
from scolarite.views import (
    ActualiteViewSet, AnneeScolaireViewSet, NiveauViewSet, ClasseViewSet, TrimestreViewSet,
    InscriptionViewSet, ResultatExamenNationalViewSet, PassageAnneeViewSet,
)
from scolarite.vitrine import EcoleConnexionView, VitrineEcoleView, DepotDossierView, DemandeInscriptionViewSet
from caisse.signature import ma_signature
from caisse.views import TarifNiveauViewSet, DossierScolariteViewSet, PaiementViewSet, DepenseViewSet
from notifications.views import NotificationViewSet, SmsOutboxViewSet
from cours.views import EnseignantViewSet, MatiereViewSet, ClasseMatiereViewSet, EmploiDuTempsViewSet, ExerciceViewSet
from evaluations.views import (bilan_pedagogique, EvaluationViewSet, NoteViewSet, CalendrierCompositionViewSet, ProgrammeCompositionViewSet,
                               CalendrierExamenBlancViewSet, ProgrammeExamenBlancViewSet, DeliberationViewSet)
from accounts.views import CustomTokenObtainPairView, UserViewSet, me, change_password, mon_compte
from accounts.journal_views import JournalActionViewSet
from accounts.supervision_views import TableauPlateformeView, IncidentsView, ResoudreIncidentsView
from parametres.accueil import AccueilPublicView, AccueilPlateformeView, PhotosAccueilView, PhotoAccueilView
from accounts.comptes_plateforme import ComptesPlateformeView, ComptePlateformeView, MotDePasseComptePlateformeView
from accounts.pilotage_views import (FicheEcoleView, TraficView, AnnoncesView, AnnonceDetailView,
                                     AnnoncesActivesView, ErreurClientView, SanteView, MaintenancePublicView,
                                     MaintenancePlateformeView)
from parametres.views import (ParametresView, CreerEcoleView, ListeEcolesView, EcoleActionView,
                              EcoleComptesView, ReinitialiserMotDePasseView, SuspendreCompteParentView)
from config.views import dashboard_stats
from eleves.carte_views import modeles_cartes, apercu_carte, choisir_modele_carte
from notifications.equipe import message_equipe, message_secretariat
from config.backup import sauvegarde_download

router = DefaultRouter()
router.register(r'eleves', EleveViewSet, basename='eleve')
router.register(r'presences', PresenceViewSet, basename='presence')
router.register(r'appels-journaliers', AppelJournalierViewSet, basename='appeljournalier')
router.register(r'annees', AnneeScolaireViewSet, basename='anneescolaire')
router.register(r'actualites', ActualiteViewSet, basename='actualite')
router.register(r'niveaux', NiveauViewSet, basename='niveau')
router.register(r'classes', ClasseViewSet, basename='classe')
router.register(r'trimestres', TrimestreViewSet, basename='trimestre')
router.register(r'inscriptions', InscriptionViewSet, basename='inscription')
router.register(r'demandes-inscription', DemandeInscriptionViewSet, basename='demandeinscription')
router.register(r'resultats-examen', ResultatExamenNationalViewSet, basename='resultatexamen')
router.register(r'passages-annee', PassageAnneeViewSet, basename='passageannee')
router.register(r'enseignants', EnseignantViewSet, basename='enseignant')
router.register(r'matieres', MatiereViewSet, basename='matiere')
router.register(r'classe-matieres', ClasseMatiereViewSet, basename='classematiere')
router.register(r'emploi-du-temps', EmploiDuTempsViewSet, basename='emploidutemps')
router.register(r'exercices', ExerciceViewSet, basename='exercice')
router.register(r'evaluations', EvaluationViewSet, basename='evaluation')
router.register(r'notes', NoteViewSet, basename='note')
router.register(r'calendriers-composition', CalendrierCompositionViewSet, basename='calendriercompo')
router.register(r'programmes-composition', ProgrammeCompositionViewSet, basename='programmecompo')
router.register(r'calendriers-examen-blanc', CalendrierExamenBlancViewSet, basename='calendrierexamenblanc')
router.register(r'programmes-examen-blanc', ProgrammeExamenBlancViewSet, basename='programmeexamenblanc')
router.register(r'deliberations', DeliberationViewSet, basename='deliberation')
router.register(r'users', UserViewSet, basename='user')
router.register(r'journal', JournalActionViewSet, basename='journal')
router.register(r'tarifs', TarifNiveauViewSet, basename='tarif')
router.register(r'dossiers-scolarite', DossierScolariteViewSet, basename='dossierscolarite')
router.register(r'paiements', PaiementViewSet, basename='paiement')
router.register(r'depenses', DepenseViewSet, basename='depense')
router.register(r'notifications', NotificationViewSet, basename='notification')
router.register(r'sms', SmsOutboxViewSet, basename='sms')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(router.urls)),
    path('api-auth/', include('rest_framework.urls')),
    path('api/auth/login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/me/', me, name='me'),
    path('api/auth/change-password/', change_password, name='change-password'),
    path('api/auth/mon-compte/', mon_compte, name='mon-compte'),
    path('api/caisse/ma-signature/', ma_signature, name='caisse-ma-signature'),
    path('api/ecoles/inscription/', CreerEcoleView.as_view(), name='creer-ecole'),
    path('api/ecoles/<int:pk>/comptes/', EcoleComptesView.as_view(), name='ecole-comptes'),
    path('api/ecoles/<int:pk>/comptes/<int:user_id>/reinitialiser/', ReinitialiserMotDePasseView.as_view(), name='ecole-compte-reinit'),
    path('api/ecoles/<int:pk>/comptes/<int:user_id>/<str:action>/', SuspendreCompteParentView.as_view(), name='ecole-compte-suspendre'),
    path('api/ecoles/<int:pk>/<str:action>/', EcoleActionView.as_view(), name='ecole-action'),
    path('api/ecoles/', ListeEcolesView.as_view(), name='liste-ecoles'),
    path('api/vitrine/<slug:slug>/dossiers/', DepotDossierView.as_view(), name='vitrine-depot-dossier'),
    path('api/vitrine/<slug:slug>/', VitrineEcoleView.as_view(), name='vitrine-ecole'),
    path('api/bilan-pedagogique/', bilan_pedagogique, name='bilan-pedagogique'),
    path('api/ecole-connexion/<slug:slug>/', EcoleConnexionView.as_view(), name='ecole-connexion'),
    path('api/parametres/', ParametresView.as_view(), name='parametres'),
    path('api/stats/dashboard/', dashboard_stats, name='dashboard-stats'),
    path('api/sauvegarde/', sauvegarde_download, name='sauvegarde'),
    path('api/plateforme/tableau/', TableauPlateformeView.as_view(), name='plateforme-tableau'),
    path('api/plateforme/incidents/', IncidentsView.as_view(), name='plateforme-incidents'),
    path('api/plateforme/incidents/resoudre/', ResoudreIncidentsView.as_view(), name='plateforme-incidents-resoudre'),
    path('api/plateforme/ecoles/<int:pk>/', FicheEcoleView.as_view(), name='plateforme-fiche-ecole'),
    path('api/plateforme/trafic/', TraficView.as_view(), name='plateforme-trafic'),
    path('api/accueil/', AccueilPublicView.as_view(), name='accueil-public'),
    path('api/plateforme/accueil/', AccueilPlateformeView.as_view(), name='plateforme-accueil'),
    path('api/plateforme/accueil/photos/', PhotosAccueilView.as_view(), name='plateforme-accueil-photos'),
    path('api/plateforme/accueil/photos/<int:pk>/', PhotoAccueilView.as_view(), name='plateforme-accueil-photo'),
    path('api/plateforme/comptes/', ComptesPlateformeView.as_view(), name='plateforme-comptes'),
    path('api/plateforme/comptes/<int:pk>/', ComptePlateformeView.as_view(), name='plateforme-compte'),
    path('api/plateforme/comptes/<int:pk>/mot-de-passe/', MotDePasseComptePlateformeView.as_view(), name='plateforme-compte-mdp'),
    path('api/plateforme/annonces/', AnnoncesView.as_view(), name='plateforme-annonces'),
    path('api/plateforme/annonces/<int:pk>/', AnnonceDetailView.as_view(), name='plateforme-annonce'),
    path('api/annonces-actives/', AnnoncesActivesView.as_view(), name='annonces-actives'),
    path('api/erreur-client/', ErreurClientView.as_view(), name='erreur-client'),
    path('api/sante/', SanteView.as_view(), name='sante'),
    path('api/maintenance/', MaintenancePublicView.as_view(), name='maintenance'),
    path('api/plateforme/maintenance/', MaintenancePlateformeView.as_view(), name='plateforme-maintenance'),
    path('api/cartes/modeles/', modeles_cartes, name='cartes-modeles'),
    path('api/cartes/choix/', choisir_modele_carte, name='cartes-choix'),
    path('api/equipe/message/', message_equipe, name='equipe-message'),
    path('api/equipe/message-secretariat/', message_secretariat, name='equipe-message-secretariat'),
    path('api/cartes/apercu/', apercu_carte, name='cartes-apercu'),
]
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
