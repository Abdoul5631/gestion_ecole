from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cours', '0010_ecole_tenant'),
    ]

    operations = [
        migrations.AddField(
            model_name='matiere',
            name='is_active',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='emploidutemps',
            name='is_active',
            field=models.BooleanField(default=True),
        ),
    ]
