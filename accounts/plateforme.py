SUPERADMIN_USERNAME = 'superadmin'
SUPERADMIN_PASSWORD = 'Ecole2025!'
SUPERADMIN_EMAIL = 'superadmin@plateforme.local'


def ensure_superadmin():
    """Crée le compte plateforme superadmin s'il n'existe pas. Ne change pas le mot de passe existant."""
    from accounts.models import User

    user = User.objects.filter(username=SUPERADMIN_USERNAME).first()
    created = False
    if user is None:
        user = User(username=SUPERADMIN_USERNAME)
        user.set_password(SUPERADMIN_PASSWORD)
        created = True
    user.email = user.email or SUPERADMIN_EMAIL
    user.role = 'SUPER_ADMIN'
    user.is_plateforme = True
    user.ecole = None
    user.is_staff = True
    user.is_active = True
    user.first_name = user.first_name or 'Super'
    user.last_name = user.last_name or 'Admin'
    user.save()
    return user, created
