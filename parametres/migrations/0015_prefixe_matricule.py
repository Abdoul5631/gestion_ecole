from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('parametres', '0014_identite_ecole'),
    ]

    operations = [
        migrations.AddField(
            model_name='parametres',
            name='prefixe_matricule',
            field=models.CharField(blank=True, default='', max_length=8, verbose_name='Préfixe des matricules'),
        ),
    ]
