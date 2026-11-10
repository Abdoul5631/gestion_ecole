from pathlib import Path
from datetime import timedelta
import os

# ─── BASE ──────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent

try:
    from dotenv import load_dotenv
    load_dotenv(BASE_DIR / '.env')
except ImportError:
    def _load_dotenv(path: Path):
        if not path.is_file():
            return
        try:
            text = path.read_text(encoding='utf-8')
        except OSError:
            return
        for raw in text.splitlines():
            line = raw.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                os.environ.setdefault(key, value)

    _load_dotenv(BASE_DIR / '.env')


def _env_bool(name, default=True):
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ('1', 'true', 'yes', 'on')


# Valeurs locales par défaut : Wend-Panga / XAMPP 127.0.0.1 continue de tourner sans .env.
SECRET_KEY = os.environ.get(
    'SECRET_KEY',
    'django-insecure-gestion-ecole-secret-key-2024-bobo-dioulasso-burkina',
)
DEBUG = _env_bool('DEBUG', True)
ALLOWED_HOSTS = [
    h.strip() for h in os.environ.get('ALLOWED_HOSTS', '*').split(',') if h.strip()
]

# ─── APPLICATIONS ──────────────────────────
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third party
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    # Apps locales
    'accounts',
    'eleves',
    'scolarite',
    'cours',
    'evaluations',
    'parametres',
    'caisse',
    'notifications',
]

# ─── MIDDLEWARE ────────────────────────────
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'config.supervision.MaintenanceMiddleware',  # page de maintenance pour tous sauf le super admin
    'config.ecole_access.EcoleStatutMiddleware',
    'accounts.journal.JournalMiddleware',
    'config.supervision.SupervisionMiddleware',  # erreurs et lenteurs du serveur, pour le super admin
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# ─── BASE DE DONNÉES ───────────────────────
# HOST en TCP (127.0.0.1), pas "localhost" : évite le slot named-pipe / reverse-DNS
# qui provoque l'erreur MariaDB 1130 (Host 'localhost' is not allowed).
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': os.environ.get('DB_NAME', 'gestion_ecole'),
        'USER': os.environ.get('DB_USER', 'root'),
        'PASSWORD': os.environ.get('DB_PASSWORD', ''),
        'HOST': os.environ.get('DB_HOST', '127.0.0.1'),
        'PORT': os.environ.get('DB_PORT', '3306'),
    }
}

# ─── VALIDATION MOTS DE PASSE ──────────────
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ─── INTERNATIONALISATION ──────────────────
LANGUAGE_CODE = 'fr-fr'
TIME_ZONE = 'Africa/Ouagadougou'
USE_I18N = True
USE_TZ = True

# ─── FICHIERS STATIQUES ────────────────────
STATIC_URL = 'static/'

# ─── MEDIA (logos, uploads) ────────────────
MEDIA_URL  = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.AutoField'

# ─── AUTH USER MODEL ───────────────────────
AUTH_USER_MODEL = 'accounts.User'

# ─── Derrière un tunnel / proxy HTTPS (Cloudflare) ─────
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
CSRF_TRUSTED_ORIGINS = ['https://*.trycloudflare.com']

# ─── CORS ──────────────────────────────────
CORS_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    # vite preview (test offline / PWA)
    'http://localhost:4173',
    'http://127.0.0.1:4173',
]
CORS_ALLOW_CREDENTIALS = True
# Adresse(s) du site en production, séparées par des virgules (ex. https://ecole.exemple.bf)
_sites = [o.strip() for o in os.environ.get('SITE_ORIGINS', '').split(',') if o.strip()]
CORS_ALLOWED_ORIGINS += _sites
CSRF_TRUSTED_ORIGINS += _sites

# ─── Mise en production (DEBUG=False) ──────
# En local (DEBUG=True) rien ne change. En production, le serveur refuse de démarrer avec une configuration dangereuse.
if not DEBUG:
    from django.core.exceptions import ImproperlyConfigured
    if SECRET_KEY.startswith('django-insecure') or SECRET_KEY == 'changez-moi-en-production' or len(SECRET_KEY) < 40:
        raise ImproperlyConfigured("Production : définissez SECRET_KEY dans .env (au moins 40 caractères aléatoires). "
                                   "Générer : python -c \"from django.core.management.utils import get_random_secret_key as g; print(g())\"")
    if '*' in ALLOWED_HOSTS:
        raise ImproperlyConfigured("Production : ALLOWED_HOSTS doit lister le(s) domaine(s) du site, pas « * ».")
    SECURE_SSL_REDIRECT = _env_bool('SECURE_SSL_REDIRECT', True)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = int(os.environ.get('SECURE_HSTS_SECONDS', 31536000))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = 'DENY'
# En-tête d'idempotence des écritures offline (sinon le navigateur bloque la requête : « Network Error »)
from corsheaders.defaults import default_headers  # noqa: E402
CORS_ALLOW_HEADERS = list(default_headers) + ['x-client-id']

# ─── REST FRAMEWORK ────────────────────────
REST_FRAMEWORK = {
    'EXCEPTION_HANDLER': 'config.erreurs.gestionnaire',  # toute erreur expliquée en français
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'accounts.journal.JWTAvecJournal',  # JWT + auteur retenu pour le journal d'activité
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
        'accounts.permissions.EcoleAccesPermission',
    ),
    # Débit limité sur les points publics (voir config/throttles.py ; désactivé pendant `manage.py test`)
    'DEFAULT_THROTTLE_RATES': {
        'connexion_identifiant': '8/min',
        'connexion_adresse': '40/min',
        'changement_mdp': '5/min',
        'erreur_client': '20/hour',
        'depot_public': '20/hour',
    },
}

# ─── JWT ───────────────────────────────────
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=8),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# ─── SMS (Orange / Moov / webhook générique) ─
SMS_API_URL = os.environ.get('SMS_API_URL', '')
SMS_API_KEY = os.environ.get('SMS_API_KEY', '')
SMS_SENDER = os.environ.get('SMS_SENDER', 'WendPanga')
SMS_PROVIDER = os.environ.get('SMS_PROVIDER', 'generic')

# Limitation du débit (connexion, dépôts publics) : coupée seulement pendant les tests automatiques
import sys as _sys
THROTTLES_DESACTIVES = 'test' in _sys.argv
