from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cours', '0006_enseignant_is_active'),
    ]

    operations = [
        migrations.AddField(
            model_name='classematiere',
            name='is_active',
            field=models.BooleanField(default=True),
        ),
    ]
