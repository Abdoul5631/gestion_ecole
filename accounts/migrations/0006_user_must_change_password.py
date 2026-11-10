from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0005_user_ecole_plateforme'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='must_change_password',
            field=models.BooleanField(
                default=False,
                help_text="L'utilisateur doit changer le mot de passe temporaire à la première connexion.",
            ),
        ),
    ]
